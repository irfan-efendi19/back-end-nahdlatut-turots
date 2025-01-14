const { Book } = require('../models');
const { Storage } = require('@google-cloud/storage');
const Validator = require('fastest-validator');

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET;
const v = new Validator();

// Skema validasi untuk buku
const bookSchema = {
  title: { type: "string", min: 3, max: 255, empty: false },
  author: { type: "string", min: 3, max: 255, empty: false },
  publishedYear: { type: "number", positive: true, integer: true },
  genre: { type: "string", optional: true },
  pages: { type: "number", positive: true, integer: true, optional: true },
  description: { type: "string", optional: true, max: 1000 }, // Parameter deskripsi
};

// Helper function: Upload file to Google Cloud Storage
const uploadFileToBucket = async (file, folder) => {
  const bucket = storage.bucket(bucketName);
  const blob = bucket.file(`${folder}/${Date.now()}-${file.originalname}`);
  const blobStream = blob.createWriteStream();

  return new Promise((resolve, reject) => {
    blobStream
      .on("finish", () => {
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${blob.name}`;
        resolve(publicUrl);
      })
      .on("error", (err) => {
        reject(new Error(`Error uploading file to Google Cloud: ${err.message}`));
      })
      .end(file.buffer);
  });
};

// GET /books - Fetch all books
const getAllBooks = async (req, res) => {
  try {
    const books = await Book.findAll();
    res.status(200).json(books);
  } catch (err) {
    res.status(500).json({ message: "Error fetching books", error: err.message });
  }
};

// GET /books/:id - Fetch book by ID
const getBookById = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    res.status(200).json(book);
  } catch (err) {
    res.status(500).json({ message: "Error fetching book", error: err.message });
  }
};

// POST /books - Add a new book
const addBook = async (req, res) => {
  try {
    // Validasi data request
    const validation = v.validate(req.body, bookSchema);
    if (validation !== true) {
      return res.status(400).json({ message: "Validation failed", errors: validation });
    }

    const { title, author, publishedYear, genre, pages, description } = req.body;

    // Ambil file dari request
    const pdfFile = req.files?.pdf?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];

    if (!pdfFile) {
      return res.status(400).json({ message: "PDF file is required" });
    }

    // Upload file ke Google Cloud Storage
    const pdfUrl = await uploadFileToBucket(pdfFile, "pdfs");
    const thumbnailUrl = thumbnailFile
      ? await uploadFileToBucket(thumbnailFile, "thumbnails")
      : null;

    // Simpan buku ke database
    const newBook = await Book.create({
      title,
      author,
      publishedYear,
      genre,
      pages,
      description, // Simpan deskripsi
      pdf_url: pdfUrl,
      thumbnail_url: thumbnailUrl,
    });

    res.status(201).json(newBook);
  } catch (err) {
    res.status(500).json({ message: "Error adding book", error: err.message });
  }
};

// DELETE /books/:id - Delete book by ID
const deleteBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Hapus file dari Google Cloud Storage jika ada
    const deletePromises = [];
    if (book.pdf_url) {
      const pdfPath = book.pdf_url.split(`${bucketName}/`)[1];
      deletePromises.push(storage.bucket(bucketName).file(pdfPath).delete());
    }
    if (book.thumbnail_url) {
      const thumbnailPath = book.thumbnail_url.split(`${bucketName}/`)[1];
      deletePromises.push(storage.bucket(bucketName).file(thumbnailPath).delete());
    }
    await Promise.all(deletePromises);

    // Hapus buku dari database
    await book.destroy();
    res.status(200).json({ message: "Book deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting book", error: err.message });
  }
};

module.exports = { getAllBooks, getBookById, addBook, deleteBook };
