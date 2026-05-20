const roleguard = (rolesAllowed) => {
  return (req, res, next) => {
    // if the user is not authenticated return unauthorized
    if (!req.user) return res.status(401).json({ message: "unauthorized" });

    // if the user does not have the required role return forbidden
    if (!rolesAllowed.includes(req.user.role))
      return res.status(403).json({ message: "forbidden" });

    next(); // if the user has the required role then move to the next middleware
  };
};

export default roleguard;
