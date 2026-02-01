// index.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
const authRoutes = require('./routes/auth');
const touristRoutes = require('./routes/tourist');
const aiRoutes = require('./routes/ai');
const highRiskRoutes = require('./routes/highrisk');
const sosRoutes = require('./routes/sos');
const routeOsrmRoutes = require('./routes/route_osrm');
const poiRoutes = require('./routes/poi');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/tourist', touristRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/highrisk', highRiskRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/route', routeOsrmRoutes);
app.use('/api', poiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.send('Smart Tourist Safety Backend is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
