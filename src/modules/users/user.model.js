const { getCollection } = require("../../config/db");

async function usersCollection() {
  return getCollection("users");
}

module.exports = { usersCollection };
