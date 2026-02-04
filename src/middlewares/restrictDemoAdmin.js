const restrictDemoAdmin = (req, res, next) => {
  const userEmail = req.dbUser?.email;
  const demoAdminEmail = process.env.DEMO_ADMIN_EMAIL;

  if (userEmail && userEmail === demoAdminEmail) {
    return res.status(403).json({
      success: false,
      message: "Action restricted for Demo Admin.",
    });
  }

  next();
};

module.exports = restrictDemoAdmin;
