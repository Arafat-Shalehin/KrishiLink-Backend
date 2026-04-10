const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const buildMongoUri = () => {
  const user = process.env.DB_USERNAME;
  const pass = process.env.DB_PASSWORD;

  if (!user || !pass) {
    throw new Error("Missing DB_USERNAME or DB_PASSWORD in .env");
  }

  // safer in case username/password contains special chars
  const u = encodeURIComponent(user);
  const p = encodeURIComponent(pass);

  return `mongodb+srv://${u}:${p}@crud-server.b5xdndi.mongodb.net/?appName=Crud-Server`;
};

const uri = buildMongoUri();

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ----------------------------------------------------------------------------
// Reconnection & Error Handling
// ----------------------------------------------------------------------------
client.on("error", (err) => {
  console.error("MongoDB Client Error:", err);
  cachedDb = null;
  connectPromise = null;
});

client.on("close", () => {
  console.warn("MongoDB Connection Closed. Resetting connection cache.");
  cachedDb = null;
  connectPromise = null;
});

let cachedDb = null;
let connectPromise = null;
const MAX_RETRIES = 5;

/**
 * Connects to MongoDB with retry logic and exponential backoff.
 */
async function connectDB() {
  // Return cached DB if we are already connected
  if (cachedDb) return cachedDb;

  let attempt = 1;
  while (attempt <= MAX_RETRIES) {
    try {
      if (!connectPromise) {
        connectPromise = client.connect();
      }

      await connectPromise;
      cachedDb = client.db("KrishiLink");
      
      console.log(`Successfully connected to DB: ${cachedDb.databaseName} (Attempt ${attempt})`);
      return cachedDb;
    } catch (err) {
      console.error(`DB connection attempt ${attempt} failed:`, err.message);
      
      // Reset promises to allow fresh retry
      connectPromise = null;
      cachedDb = null;

      if (attempt >= MAX_RETRIES) {
        console.error("Critical: Maximum DB connection retries reached.");
        throw err;
      }

      // Exponential backoff: 2s, 4s, 8s, 16s...
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}

async function getDb() {
  return cachedDb || connectDB();
}

async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

module.exports = {
  ObjectId,
  connectDB,
  getDb,
  getCollection,
  client, // Native client for transactions/sessions
};
