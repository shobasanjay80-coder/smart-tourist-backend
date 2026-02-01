// backend/routes/route_osrm.js
// Method A: Virtual-barrier detours to avoid circular geofences (works with public OSRM)
const express = require('express');
const router = express.Router();
const axios = require('axios');
const polyline = require('@mapbox/polyline');
const fs = require('fs');
const path = require('path');

// --- Config ---
const OSRM_SERVER = process.env.OSRM_SERVER || 'https://router.project-osrm.org';
const HR_FILE = path.join(__dirname, '../data/highrisk.json');
let zones = [];
try {
  if (fs.existsSync(HR_FILE)) zones = JSON.parse(fs.readFileSync(HR_FILE, 'utf8'));
} catch (e) {
  console.warn('Could not load zones:', e.message);
}

// --- Helpers: projections & distances (local planar approx) ---
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }
const EARTH_R = 6371000;

// Haversine distance (meters)
function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

// project lat/lng to local XY (meters) relative to origin
function latLngToXY(origin, p) {
  const x = toRad(p.lng - origin.lng) * EARTH_R * Math.cos(toRad(origin.lat));
  const y = toRad(p.lat - origin.lat) * EARTH_R;
  return { x, y };
}
function xyToLatLng(origin, xy) {
  const lat = origin.lat + (xy.y / EARTH_R) * (180 / Math.PI);
  const lng = origin.lng + (xy.x / (EARTH_R * Math.cos(toRad(origin.lat)))) * (180 / Math.PI);
  return { lat, lng };
}

// point to segment distance (meters) using local projection
function pointToSegmentDistMeters(A, B, C) {
  const origin = A;
  const Axy = { x: 0, y: 0 };
  const Bxy = latLngToXY(origin, B);
  const Cxy = latLngToXY(origin, C);
  const vx = Bxy.x - Axy.x, vy = Bxy.y - Axy.y;
  const wx = Cxy.x - Axy.x, wy = Cxy.y - Axy.y;
  const c1 = vx*wx + vy*wy;
  const c2 = vx*vx + vy*vy;
  if (c2 === 0) return Math.hypot(wx, wy);
  let t = c1 / c2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const projx = Axy.x + t * vx;
  const projy = Axy.y + t * vy;
  return Math.hypot(Cxy.x - projx, Cxy.y - projy);
}

// does AB segment intersect circle z?
function segmentIntersectsCircle(A, B, z) {
  const dist = pointToSegmentDistMeters(A, B, { lat: z.lat, lng: z.lng });
  return dist <= (z.radius || 0);
}

// decode polyline6 -> [{lat,lng}]
function decodePolyline6(poly6) {
  const arr = polyline.decode(poly6, 6);
  return arr.map(p => ({ lat: p[0], lng: p[1] }));
}

// coords array -> OSRM coords string (lon,lat;lon,lat...)
function coordsToOsrmString(points) {
  return points.map(p => `${p.lng},${p.lat}`).join(';');
}

// fetch OSRM routes for an ordered list of points (start;via...;end)
async function fetchOsrmRoutesWithWaypoints(points, profile='driving', alternatives=true) {
  const coords = coordsToOsrmString(points);
  const url = `${OSRM_SERVER}/route/v1/${profile}/${coords}`;
  const params = {
    overview: 'full',
    geometries: 'polyline6',
    steps: false,
    alternatives: alternatives ? 'true' : 'false'
  };
  const resp = await axios.get(url, { params, timeout: 15000 });
  if (!resp.data || resp.data.code !== 'Ok') throw new Error('OSRM error: ' + (resp.data?.message || resp.status));
  return resp.data.routes;
}

// score route by distance + penalty for touching zones (same as earlier)
function scoreRoute(coords, zonesList) {
  let dist = 0;
  for (let i=1;i<coords.length;i++) dist += haversine(coords[i-1], coords[i]);
  let penalty = 0;
  for (const p of coords) {
    for (const z of zonesList) {
      const d = haversine(p, { lat: z.lat, lng: z.lng });
      if (d <= z.radius) {
        const depth = (z.radius - d) / z.radius;
        penalty += (z.risk ?? 80) * depth * 10;
      }
    }
  }
  return { score: dist + penalty, dist, penalty };
}

// --- DETOUR WAYPOINT GENERATION (virtual barrier)
// For each intersecting circle we generate a detour point located at circle edge + margin
// We compute the perpendicular projection of center onto AB, then step perpendicular by (radius + margin)
// side = +1 or -1 to choose which side to route around.
function detourPointAroundZone(A, B, z, side=1, marginMeters=60) {
  const origin = A;
  const Axy = { x: 0, y: 0 };
  const Bxy = latLngToXY(origin, B);
  const Zxy = latLngToXY(origin, { lat: z.lat, lng: z.lng });

  const vx = Bxy.x - Axy.x;
  const vy = Bxy.y - Axy.y;
  const wx = Zxy.x - Axy.x;
  const wy = Zxy.y - Axy.y;
  const c2 = vx*vx + vy*vy;
  let t = (c2 === 0) ? 0 : (vx*wx + vy*wy) / c2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const projx = Axy.x + t*vx, projy = Axy.y + t*vy;

  // vector from center to projection
  let dx = projx - Zxy.x, dy = projy - Zxy.y;
  let baseAngle = Math.atan2(dy, dx); // center -> projection
  const rotate = side * Math.PI/2; // +90 or -90
  const angle = baseAngle + rotate;

  const r = (z.radius || 0) + marginMeters;
  const px = Zxy.x + r * Math.cos(angle);
  const py = Zxy.y + r * Math.sin(angle);

  return xyToLatLng(origin, { x: px, y: py });
}

// find zones intersecting straight segment start->end
function zonesIntersectingSegment(start, end, zonesList) {
  return zonesList.filter(z => segmentIntersectsCircle(start, end, z));
}

// route intersects any zone?
function routeIntersectsZones(routeCoords, zonesList) {
  for (let i=1;i<routeCoords.length;i++) {
    const A = routeCoords[i-1], B = routeCoords[i];
    for (const z of zonesList) { if (segmentIntersectsCircle(A, B, z)) return true; }
  }
  return false;
}

// ----- Top-level: attempt safe routing by trying virtual-barrier waypoints
// Strategy: try OSRM base alternatives; if any is fully safe -> return it.
// If not, build detour waypoints around intersecting zones, try side combinations (+/-) and margins.
// Return the first fully-safe route or best fallback.
async function fetchSafeRoute(start, end, profile='driving') {
  // 1) try base alternatives
  let baseRoutes = [];
  try { baseRoutes = await fetchOsrmRoutesWithWaypoints([start, end], profile, true); } catch (e) { baseRoutes = []; }

  const evaluated = (baseRoutes || []).map(r => {
    const coords = decodePolyline6(r.geometry);
    const meta = scoreRoute(coords, zones);
    return { osrm: r, coords, distanceMeters: r.distance, durationSeconds: r.duration, score: meta.score, penalty: meta.penalty };
  });

  // If any base route is fully safe, return best safe candidate
  const safeBase = evaluated.filter(e => !routeIntersectsZones(e.coords, zones));
  if (safeBase.length > 0) {
    // pick lowest score among safe base
    safeBase.sort((a,b) => a.score - b.score);
    return { chosen: safeBase[0], usedWaypoints: [], safe: true, note: `Found safe base route (${safeBase.length} safe alternatives)` };
  }

  // 2) If base routes are not safe, compute intersecting zones for straight segment
  const intersectZones = zonesIntersectingSegment(start, end, zones);
  const zonesToTry = intersectZones.length ? intersectZones : zones.slice(0, 3); // try up to first 3 if none intersect straight line

  // Prepare attempt strategies: sides and margins
  const attempts = [];
  // try side +1 all
  attempts.push({ sides: zonesToTry.map(_ => +1), margin: 60 });
  // try side -1 all
  attempts.push({ sides: zonesToTry.map(_ => -1), margin: 60 });
  // try flipping individual zones
  for (let i=0;i<zonesToTry.length;i++) {
    const s = zonesToTry.map((_, idx) => (idx === i ? -1 : +1));
    attempts.push({ sides: s, margin: 80 });
  }
  // more margin attempts
  attempts.push({ sides: zonesToTry.map(_ => +1), margin: 120 });
  attempts.push({ sides: zonesToTry.map(_ => -1), margin: 120 });

  // try each attempt
  const fallbackCandidates = [...evaluated]; // include base evaluated as fallback
  for (const attempt of attempts) {
    // build detour waypoints per zone
    const waypoints = zonesToTry.map((z, idx) => detourPointAroundZone(start, end, z, attempt.sides[idx] || +1, attempt.margin || 60));
    // order by projection along start->end
    const pointsWithT = waypoints.map(wp => {
      const origin = start;
      const Axy = { x: 0, y: 0 };
      const Bxy = latLngToXY(origin, end);
      const vx = Bxy.x - Axy.x, vy = Bxy.y - Axy.y;
      const Zxy = latLngToXY(origin, wp);
      const c2 = vx*vx + vy*vy;
      let t = (c2 === 0) ? 0 : (vx*Zxy.x + vy*Zxy.y) / c2;
      return { wp, t: Math.max(0, Math.min(1, t)) };
    });
    pointsWithT.sort((a,b) => a.t - b.t);
    const orderedWaypoints = pointsWithT.map(x => x.wp);
    // call OSRM with start + waypoints + end
    const points = [start, ...orderedWaypoints, end];
    try {
      const routes = await fetchOsrmRoutesWithWaypoints(points, profile, false);
      if (!routes || routes.length === 0) continue;
      const r = routes[0];
      const coords = decodePolyline6(r.geometry);
      const meta = scoreRoute(coords, zones);
      const candidate = { osrm: r, coords, distanceMeters: r.distance, durationSeconds: r.duration, score: meta.score, penalty: meta.penalty, usedWaypoints: orderedWaypoints };
      // if fully safe, return immediately
      if (!routeIntersectsZones(candidate.coords, zones)) {
        return { chosen: candidate, usedWaypoints: orderedWaypoints, safe: true, note: `Safe route found with ${orderedWaypoints.length} waypoint(s)` };
      } else {
        fallbackCandidates.push(candidate);
      }
    } catch (e) {
      // ignore and continue attempts
    }
  }

  // 3) If no fully-safe route found, pick least-penalty candidate from fallback
  if (fallbackCandidates.length > 0) {
    fallbackCandidates.sort((a,b) => (a.penalty ?? 1e9) - (b.penalty ?? 1e9) || a.distanceMeters - b.distanceMeters);
    return { chosen: fallbackCandidates[0], usedWaypoints: fallbackCandidates[0].usedWaypoints || [], safe: false, note: 'No fully-safe route — returning least-risky fallback' };
  }

  // 4) nothing found
  throw new Error('No routes found');
}

// --- Express endpoint
// POST /api/route-advanced
// body: { startLat, startLng, endLat, endLng, mode }  mode: 'safe'|'fastest'|'shortest'
router.post('/', async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, mode = 'safe', profile = 'driving' } = req.body;
    if (startLat == null || startLng == null || endLat == null || endLng == null) {
      return res.status(400).json({ error: 'start and end required' });
    }
    const start = { lat: +startLat, lng: +startLng };
    const end = { lat: +endLat, lng: +endLng };

    if (mode === 'safe') {
      const result = await fetchSafeRoute(start, end, profile);
      const chosen = result.chosen;
      return res.json({
        safe: result.safe,
        note: result.note,
        usedWaypoints: (result.usedWaypoints || []),
        route: chosen.coords,
        distanceMeters: chosen.distanceMeters,
        durationSeconds: chosen.durationSeconds,
        riskPenalty: chosen.penalty,
      });
    } else {
      // fastest/shortest: ask OSRM for alternatives and pick
      const routes = await fetchOsrmRoutesWithWaypoints([start, end], profile, true);
      const evaluated = routes.map(r => {
        const coords = decodePolyline6(r.geometry);
        const meta = scoreRoute(coords, zones);
        return { osrm: r, coords, distanceMeters: r.distance, durationSeconds: r.duration, score: meta.score, penalty: meta.penalty };
      });

      let chosen;
      if (mode === 'shortest') {
        chosen = evaluated.reduce((a,b) => (!a || b.distanceMeters < a.distanceMeters) ? b : a, null);
      } else { // fastest
        chosen = evaluated.reduce((a,b) => (!a || b.durationSeconds < a.durationSeconds) ? b : a, null);
      }

      return res.json({
        safe: !routeIntersectsZones(chosen.coords, zones),
        note: 'OSRM alternatives used',
        usedWaypoints: [],
        route: chosen.coords,
        distanceMeters: chosen.distanceMeters,
        durationSeconds: chosen.durationSeconds,
        riskPenalty: chosen.penalty
      });
    }

  } catch (err) {
    console.error('route-advanced error:', err.message || err);
    res.status(500).json({ error: err.message || 'server error' });
  }
});

module.exports = router;
