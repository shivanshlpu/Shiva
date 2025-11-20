// server.js

// ----------------------------------------------------
// A. MODULE IMPORTS AND CONFIGURATION
// ----------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 
const crypto = require('crypto'); 
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3000;

// CRITICAL: Construct the MongoDB Atlas Connection URI using the environment variable
const DB_URI = 'mongodb+srv://factsduniya900_db_user:shivansh900@shi.b4bpwpe.mongodb.net/?retryWrites=true&w=majority&appName=SHI';
// ----------------------------------------------------
// B. MIDDLEWARE SETUP
// ----------------------------------------------------

// CORS: Allows frontend (e.g., localhost) to communicate with the server
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body Parser: Required to read JSON data from client requests
app.use(express.json());


// ----------------------------------------------------
// C. DATABASE CONNECTION
// ----------------------------------------------------

mongoose.connect(DB_URI) 
    .then(() => console.log('✅ MongoDB Atlas connected successfully'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('Please ensure your DB_URI is correct and IP access is enabled on Atlas.');
    });


// ----------------------------------------------------
// D. MONGOOSE SCHEMAS (Database Models)
// ----------------------------------------------------

// Existing Tourist Schema
const touristSchema = new mongoose.Schema({
    name: String, age: Number, gender: String, city: String, destination: String,
    mobile: String, emergency: String,
    cardType: { type: String, enum: ['Gold', 'Platinum', 'Diamond'], default: 'Gold' },

    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    id: { type: String, required: true, unique: true }, 
    guideId: { type: String, default: null }, 
    
    virtualID: Object 
}, { collection: 'tourists' });
const Tourist = mongoose.model('Tourist', touristSchema);

// Existing Guide Schema
const guideSchema = new mongoose.Schema({
    name: String, age: Number, gender: String, emergency: String,
    
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['guide', 'individual-group'], required: true },
    
    groupName: { type: String, default: 'Solo Guide' },
    groupMembers: { type: Number, default: 0 },
    
}, { collection: 'guides' });
const Guide = mongoose.model('Guide', guideSchema);

// Existing SafetyZone Schema
const safetyZoneSchema = new mongoose.Schema({
    zoneId: { type: String, required: true, unique: true },
    name: String,
    type: { type: String, enum: ['Safe', 'Unsafe'], default: 'Safe' },
    geoJson: Object,
    guideId: String,
    createdAt: { type: Date, default: Date.now }
}, { collection: 'safetyZones' });
const SafetyZone = mongoose.model('SafetyZone', safetyZoneSchema);

// --- NEW BLOCKCHAIN SCHEMA ---
const blockSchema = new mongoose.Schema({
    index: { type: Number, required: true, unique: true },
    timestamp: { type: Number, required: true },
    data: { type: Object, required: true },
    previousHash: { type: String, required: true },
    nonce: { type: Number, required: true },
    hash: { type: String, required: true, unique: true }
}, { collection: 'blockchain' }); 

const Block = mongoose.model('Block', blockSchema);

// ----------------------------------------------------
// E. API ROUTES (Endpoints)
// ----------------------------------------------------

// --- NEW BLOCKCHAIN ENDPOINTS ---

const calculateHash = (blockData, nonce) => {
    const dataString = JSON.stringify(blockData) + nonce;
    return crypto.createHash('sha256').update(dataString).digest('hex');
};

app.get('/api/blockchain', async (req, res) => {
    try {
        const chain = await Block.find().sort({ index: 1 });
        if (chain.length === 0) {
            const genesisData = { ticketId: 'GENESIS_BLOCK', tourist: 'System Genesis', location: [0,0] };
            const genesisHash = calculateHash(genesisData, 0);
            const genesisBlock = new Block({ index: 0, timestamp: Date.now(), data: genesisData, previousHash: '0', nonce: 0, hash: genesisHash });
            await genesisBlock.save();
            return res.json([genesisBlock]);
        }
        res.json(chain);
    } catch (err) {
        console.error('Failed to fetch blockchain:', err);
        res.status(500).json({ error: 'Failed to fetch blockchain' });
    }
});

app.post('/api/blockchain/add', async (req, res) => {
    const newBlockData = req.body;
    try {
        const latestBlock = await Block.findOne().sort({ index: -1 });

        let newBlock = {
            index: latestBlock ? latestBlock.index + 1 : 1, 
            timestamp: Date.now(),
            data: newBlockData,
            previousHash: latestBlock ? latestBlock.hash : '0',
            nonce: 0,
            hash: ''
        };

        let nonce = 0;
        let hash = '';
        while (!hash.startsWith('000')) {
            hash = calculateHash(newBlock, nonce);
            nonce++;
        }
        
        newBlock.nonce = nonce;
        newBlock.hash = hash;
        newBlock.data.ticketId = `TKT-${newBlock.index}-${Date.now().toString().slice(-4)}`;

        const createdBlock = await Block.create(newBlock);
        res.status(201).json(createdBlock);
    } catch (err) {
        console.error("Error mining or inserting block:", err);
        res.status(500).json({ error: 'Failed to mine and add block' });
    }
});

// --- EXISTING API ROUTES ---
app.post('/api/register/tourist', async (req, res) => {
    try {
        const { username } = req.body;
        const userExists = await Tourist.findOne({ username }) || await Guide.findOne({ username });
        if (userExists) {
            return res.status(409).json({ message: 'Username already taken.' });
        }
        const newTourist = new Tourist({ ...req.body, id: `TOURIST-${Date.now()}` });
        await newTourist.save();
        res.status(201).json({ message: 'Registration successful!', tourist: newTourist });
    } catch (error) {
        console.error('Tourist Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

app.post('/api/register/guide', async (req, res) => {
    try {
        const { username } = req.body;
        const userExists = await Tourist.findOne({ username }) || await Guide.findOne({ username });
        if (userExists) {
            return res.status(409).json({ message: 'Username already taken.' });
        }
        const newGuide = new Guide(req.body);
        await newGuide.save();
        res.status(201).json({ message: 'Guide registration successful!', guide: newGuide });
    } catch (error) {
        console.error('Guide Registration Error:', error);
        res.status(500).json({ message: 'Server error during guide registration.' });
    }
});

app.post('/api/register/tourist-batch', async (req, res) => {
    try {
        const newTourists = req.body;
        const inserted = await Tourist.insertMany(newTourists, { ordered: false });
        res.status(201).json({ message: `${inserted.length} members registered successfully!`, tourists: inserted });
    } catch (error) {
        console.error('Batch Tourist Registration Error:', error);
        res.status(500).json({ message: 'Failed to complete member registration on server.' });
    }
});

app.post('/api/login/:role', async (req, res) => {
    const { username, password } = req.body;
    const { role } = req.params; 
    try {
        let user;
        if (role === 'tourist') {
            user = await Tourist.findOne({ username, password });
        } else {
            user = await Guide.findOne({ username, password, role });
        }
        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        if (role === 'individual-group' && user.groupMembers <= 1) {
            return res.status(403).json({ message: 'Access denied: Group must have more than one member for group access.' });
        }
        res.status(200).json({ message: 'Login successful!', user: user.toObject() });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

app.get('/api/tourist/:id', async (req, res) => {
    try {
        const tourist = await Tourist.findOne({ id: req.params.id }); 
        if (!tourist) {
            return res.status(404).json({ message: 'Tourist not found.' });
        }
        res.status(200).json({ user: tourist.toObject() });
    } catch (error) {
        console.error('Fetch Tourist by ID Error:', error);
        res.status(500).json({ message: 'Server error fetching tourist data.' });
    }
});

app.get('/api/tourists/unassigned', async (req, res) => {
    try {
        const tourists = await Tourist.find({ guideId: null });
        res.status(200).json(tourists);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch unassigned tourists.' });
    }
});

app.get('/api/tourists/by-guide/:guideId', async (req, res) => {
    try {
        const tourists = await Tourist.find({ guideId: req.params.guideId });
        if (tourists.length === 0) {
            return res.status(404).json({ message: 'No tourists assigned to this guide.' });
        }
        res.status(200).json(tourists);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch assigned tourists.' });
    }
});

app.post('/api/zones/save', async (req, res) => {
    try {
        await SafetyZone.deleteMany({ guideId: req.body.guideId });
        await SafetyZone.insertMany(req.body.zones);
        res.status(200).json({ message: 'Safety zones saved successfully.' });
    } catch (error) {
        console.error('Zone Save Error:', error);
        res.status(500).json({ message: 'Failed to save safety zones.' });
    }
});

app.get('/api/zones', async (req, res) => {
    try {
        const zones = await SafetyZone.find({});
        res.status(200).json(zones.map(zone => zone.toObject()));
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch safety zones.' });
    }
});

app.put('/api/tourists/update-batch', async (req, res) => {
    try {
        const updates = req.body.updates;
        const bulkOps = updates.map(update => ({
            updateOne: {
                filter: { id: update.id }, 
                update: { $set: update.data }
            }
        }));
        const result = await Tourist.bulkWrite(bulkOps);
        res.status(200).json({ 
            message: `${result.modifiedCount} tourists updated successfully.`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Batch Update Error:', error);
        res.status(500).json({ message: 'Failed to update tourist data in batch.' });
    }
});

app.delete('/api/tourists/delete/:id', async (req, res) => {
    try {
        const result = await Tourist.deleteOne({ id: req.params.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Tourist not found.' });
        }
        res.status(200).json({ message: 'Tourist deleted successfully.' });
    } catch (error) {
        console.error('Delete Tourist Error:', error);
        res.status(500).json({ message: 'Failed to delete tourist.' });
    }
});

app.get('/api/tourists/all', async (req, res) => {
    try {
        const tourists = await Tourist.find({}); 
        res.status(200).json(tourists);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch all tourist records.' });
    }
});


// ----------------------------------------------------
// F. START SERVER
// ----------------------------------------------------

app.listen(PORT, () => {
    console.log(`\nServer is running!`);
    console.log(`Local Access: http://localhost:${PORT}`);
    console.log(`-------------------------------------------`);
});
