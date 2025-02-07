var express = require("express");
var router = express.Router();

const verifyToken  = require("../middleware/VerifyToken");

const {getUsers, getUserDetail } = require("../controllers/User");

router.get("/", verifyToken, getUsers);

router.get("/id", verifyToken, getUserDetail);

module.exports = router;
