const express = require("express");
const cors = require("cors");

const cropRoutes = require("./modules/crops/crop.routes");
const interestRoutes = require("./modules/interests/interest.routes");
const userRoutes = require("./modules/users/user.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const adminRoutes = require("./modules/admin/admin.routes");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use(cropRoutes);
app.use(interestRoutes);
app.use(userRoutes);
app.use(dashboardRoutes);
app.use(adminRoutes);

// Health
app.get("/", (req, res) => {
  res.send("KrishiLink Server is running.");
});

module.exports = app;
