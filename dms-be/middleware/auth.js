const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ msg: "No token provided" });
  }

  // Check if the authorization header has the Bearer format
  const parts = authHeader.split(" ");

  if (parts.length !== 2) {
    return res.status(401).json({ msg: "Token error" });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ msg: "Token malformatted" });
  }

  try {
    // Make sure JWT_SECRET is properly loaded from environment
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error("JWT_SECRET is not defined in environment variables");
      return res.status(500).json({ msg: "Server configuration error" });
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error("Auth error:", error);

    // Clear the token from localStorage on the client side
    res.setHeader("Clear-Token", "true");

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ msg: "Token expired, please login again" });
    } else if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ msg: "Invalid token, please login again" });
    } else {
      return res.status(403).json({ msg: "Authentication failed" });
    }
  }
};
