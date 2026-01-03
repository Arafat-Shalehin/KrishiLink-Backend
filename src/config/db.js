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

let cachedDb = null;
let connectPromise = null;

async function connectDB() {
  if (cachedDb) return cachedDb;

  if (!connectPromise) {
    connectPromise = client.connect();
  }

  await connectPromise;

  cachedDb = client.db("KrishiLink");
  console.log("Connected to DB:", client.db().databaseName);
  return cachedDb;
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
};
