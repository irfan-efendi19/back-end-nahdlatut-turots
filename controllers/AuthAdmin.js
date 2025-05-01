var jwt = require("jsonwebtoken");
var bcrypt = require("bcrypt");
const express = require("express");
const app = express();

app.use(express.json());

const { Admin } = require("../models");

const Login = async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const admin = await Admin.findOne({
      where: {
        username: req.body.username,
      },
    });

    const match = await bcrypt.compare(req.body.password, admin.password);
    if (!match) {
      return res.status(400).json({
        status: "fail",
        message: "Password Salah",
      });
    }

    const adminId = admin.id;
    const name = admin.name;
    const username = admin.username;
    const accessToken = jwt.sign(
      { adminId, name, username },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "20s" }
    );
    const refreshToken = jwt.sign(
      { adminId, name, username },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    await Admin.update(
      { refresh_token: refreshToken },
      {
        where: {
          id: adminId,
        },
      }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: false,
      maxAge: 24 * 60 * 60 * 1000,
      // , secure: true
    });

    res.json({ accessToken });
  } catch (error) {
    res.status(404).json({
      status: "fail",
      message: "Akun tidak ditemukan",
    });
  }
};

const Logout = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.sendStatus(401);

  const admin = await Admin.findOne({
    where: {
      refresh_token: refreshToken,
    },
  });

  if (!admin) return res.sendStatus(204);

  const adminId = admin.id;
  await Admin.update(
    { refresh_token: null },
    {
      where: {
        id: adminId,
      },
    }
  );

  res.clearCookie("refreshToken");
  return res.sendStatus(200);
};

const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.sendStatus(401);

    const admin = await Admin.findOne({
      where: {
        refresh_token: refreshToken,
      },
    });

    if (!admin) return res.sendStatus(403);

    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      (err, decoded) => {
        if (err) return res.sendStatus(403);
        const adminId = admin.id;
        const name = admin.name;
        const username = admin.username;
        const accessToken = jwt.sign(
          { adminId, name, username },
          process.env.ACCESS_TOKEN_SECRET,
          {
            expiresIn: "15s",
          }
        );
        res.json({ accessToken });
      }
    );
  } catch (error) {
    console.log(error);
  }
};

const register = async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const { username, password, name } = req.body;

    // Check if the request body contains the necessary fields
    if (!username || !password || !name) {
      return res.status(400).json({
        status: "fail",
        message: "Mohon lengkapi semua field",
      });
    }

    const existingAdmin = await Admin.findOne({
      where: {
        username: username,
      },
    });

    if (existingAdmin) {
      return res.status(400).json({
        status: "fail",
        message: "akun sudah digunakan",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newAdmin = await Admin.create({
      username: username,
      password: hashedPassword,
      name: name,
    });

    // Create a token for the new user
    const adminId = newAdmin.id;
    const uniqueTokenData = `${adminId}-${Date.now()}`;
    const accessToken = jwt.sign(
      { adminId, name, username },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "20s",
      }
    );

    // Save the unique token to the user record (or wherever appropriate in your app)
    await Admin.update(
      { refresh_token: uniqueTokenData },
      {
        where: {
          id: adminId,
        },
      }
    );

    // Respond with success message and token
    res.status(201).json({
      status: "success",
      message: "Registrasi berhasil",
      admin: {
        id: newAdmin.id,
        username: newAdmin.username,
        name: newAdmin.name,
      },
      accessToken: accessToken,
    });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({
      status: "error",
      message: "Registrasi gagal",
    });
  }
};

module.exports = {
  Login,
  Logout,
  refreshToken,
  register,
};
