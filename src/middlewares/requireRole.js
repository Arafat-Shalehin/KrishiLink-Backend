module.exports = function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = req.dbUser?.role;

    // console.log("Checking Role:", { userRole: role, requiredRoles: allowedRoles });

    if (!role) {
      return res.status(403).json({ success: false, message: "Forbidden: No Role Found" });
    }

    // admin bypass
    if (role === "admin") return next();

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Forbidden: Role '${role}' not allowed. Required: ${allowedRoles.join(", ")}` 
      });
    }

    next();
  };
};
