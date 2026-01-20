module.exports = function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = req.dbUser?.role;

    if (!role) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // admin bypass (future-proof)
    if (role === "admin") return next();

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    next();
  };
};
