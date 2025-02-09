var jwt = require("jsonwebtoken");
var bcrypt = require("bcrypt");
const express = require("express");
const app = express();

app.use(express.json());

const { User } = require("../models");

const Login = async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const user = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    const match = await bcrypt.compare(req.body.password, user.password);
    if (!match) {
      return res.status(400).json({
        status: "fail",
        message: "Password Salah",
      });
    }

    const userId = user.id;
    const name = user.name;
    const email = user.email;
    const accessToken = jwt.sign(
      { userId, name, email },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "20s" }
    );
    const refreshToken = jwt.sign(
      { userId, name, email },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    await User.update(
      { refresh_token: refreshToken },
      {
        where: {
          id: userId,
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

  const user = await User.findOne({
    where: {
      refresh_token: refreshToken,
    },
  });

  if (!user) return res.sendStatus(204);

  const userId = user.id;
  await User.update(
    { refresh_token: null },
    {
      where: {
        id: userId,
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

    const user = await User.findOne({
      where: {
        refresh_token: refreshToken,
      },
    });

    if (!user) return res.sendStatus(403);

    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      (err, decoded) => {
        if (err) return res.sendStatus(403);
        const userId = user.id;
        const name = user.name;
        const email = user.email;
        const accessToken = jwt.sign(
          { userId, name, email },
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
    const { email, password, name } = req.body;

    // Check if the request body contains the necessary fields
    if (!email || !password || !name) {
      return res.status(400).json({
        status: "fail",
        message: "Mohon lengkapi semua field",
      });
    }

    // Check if the email already exists
    const existingUser = await User.findOne({
      where: {
        email: email,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        status: "fail",
        message: "email sudah digunakan",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = await User.create({
      email: email,
      password: hashedPassword,
      name: name,
    });

    // Create a token for the new user
    const userId = newUser.id;
    const uniqueTokenData = `${userId}-${Date.now()}`;
    const accessToken = jwt.sign(
      { userId, name, email },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "20s",
      }
    );

    // Save the unique token to the user record (or wherever appropriate in your app)
    await User.update(
      { refresh_token: uniqueTokenData },
      {
        where: {
          id: userId,
        },
      }
    );

    // Respond with success message and token
    res.status(201).json({
      status: "success",
      message: "Registrasi berhasil",
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
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
