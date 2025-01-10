const express = require("express");
const router = express.Router();
const upload = require('../middleware/multer'); // Impor middleware multer
const { getAllBooks, getBookById, addBook, deleteBook } = require("../controllers/bookController");

// GET /books - Fetch all books
router.get("/", getAllBooks);

// GET /books/:id - Fetch book by ID
router.get("/:id", getBookById);

// POST /books - Add a new book (gunakan multer untuk menangani upload file)
router.post(
    "/",
    upload.fields([
      { name: "pdf", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ]),
    addBook
  );
  

// DELETE /books/:id - Delete book by ID
router.delete("/:id", deleteBook);

module.exports = router;
