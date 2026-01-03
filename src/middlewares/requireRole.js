module.exports = function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role; // would come from custom claims
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    next();
  };
};
