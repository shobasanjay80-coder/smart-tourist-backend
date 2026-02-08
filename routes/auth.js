const express = require('express');
const router = express.Router();
const tourists = require('../data/tourists.json');
const { OAuth2Client } = require('google-auth-library');

// put your GOOGLE WEB CLIENT ID here
const client = new OAuth2Client('1008230569356-7s3r8c6jssnakencdopr5k3akaj06gpk.apps.googleusercontent.com');


// ---------------- DIGITAL ID LOGIN ----------------
router.post('/login', (req, res) => {
  const { digitalId } = req.body;
  const tourist = tourists.find(t => t.digitalId === digitalId);

  if (tourist) res.json({ tourist });
  else res.status(404).json({ error: "Digital ID not found" });
});


// ---------------- GOOGLE LOGIN ----------------
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    const ticket = await client.verifyIdToken({
      idToken,
      audience: 'PASTE_WEB_CLIENT_ID_HERE',
    });

    const payload = ticket.getPayload();

    const tourist = {
      name: payload.name,
      email: payload.email,
      photo: payload.picture,
      loginType: 'google',
    };

    res.json({ tourist });

  } catch (err) {
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

module.exports = router;
