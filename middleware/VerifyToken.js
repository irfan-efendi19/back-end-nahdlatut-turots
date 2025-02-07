const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: Invalid token format" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Forbidden: Invalid or expired token" });
    }

    req.user = {
      id: decoded.userId, 
      name: decoded.name,
      email: decoded.email,
    };

    req.admin = {
      id: decoded.adminId,
      name: decoded.name,
      email: decoded.email,
    };

    next();
  });
};

module.exports = verifyToken;
