const { Book } = require('../models');
const { Storage } = require('@google-cloud/storage');
const Validator = require('fastest-validator');

const { Op } = require("sequelize"); // Import operator untuk pencarian

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET;
const v = new Validator();

// Skema validasi untuk buku
const bookSchema = {
  title: { type: "string", min: 3, max: 255, empty: false },
  author: { type: "string", min: 3, max: 255, empty: false },
  published_year: { type: "string", positive: true, optional: true }, 
  genre: { type: "string", optional: true },
  pages: { type: "string", positive: true, optional: true },  
  description: { type: "string", optional: true, max: 1000 }, 
}


// Helper function: Upload file to Google Cloud Storage
const uploadFileToBucket = async (file, folder) => {
  try {
    const bucket = storage.bucket(bucketName);

    // Encode nama file untuk menghindari karakter khusus yang menyebabkan masalah
    const encodedFileName = encodeURIComponent(file.originalname).replace(/%20/g, "+"); // Mengganti %20 dengan "+" untuk kompatibilitas
    const fileName = `${folder}/${Date.now()}-${encodedFileName}`;
    const blob = bucket.file(fileName);

    // Membuat stream untuk mengunggah file
    const blobStream = blob.createWriteStream({
      resumable: false, 
      gzip: true, 
      metadata: {
        contentType: file.mimetype, 
      },
    });

    // Return promise untuk menyelesaikan upload
    return new Promise((resolve, reject) => {
      blobStream
        .on("finish", () => {
          // URL publik setelah file berhasil diunggah
          const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
          resolve(publicUrl);
        })
        .on("error", (err) => {
          reject(new Error(`Error uploading file to Google Cloud: ${err.message}`));
        })
        .end(file.buffer);
    });
  } catch (error) {
    throw new Error(`Unexpected error during file upload: ${error.message}`);
  }
};



// GET /books - Fetch all books
const getAllBooks = async (req, res) => {
  try {
    const { genre } = req.query; 

    let books;
    if (genre) {
      books = await Book.findAll({
        where: {
          genre: genre,
        },
      });
    } else {
      books = await Book.findAll();
    }
    if (books.length === 0) {
      return res.status(404).json({ message: "Tidak menemukan kitab" });
    }

    res.status(200).json(books);
  } catch (err) {
    res.status(500).json({ message: "Kesalahan mengambil kitab", error: err.message });
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

    const { title, author, published_year, genre, pages, description } = req.body;

    // Ambil file dari request
    const pdfFile = req.files?.pdf?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];

    // Upload file ke Google Cloud Storage
    const pdfUrl = pdfFile
      ? await uploadFileToBucket(pdfFile, "pdfs") // Corrected here
      : null;
    const thumbnailUrl = thumbnailFile
      ? await uploadFileToBucket(thumbnailFile, "thumbnails")
      : null;

    // Simpan buku ke database
    const newBook = await Book.create({
      title,
      author,
      published_year,
      genre,
      pages,
      description,
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

const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const book = await Book.findByPk(id);

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const validation = v.validate(req.body, bookSchema);
    if (validation !== true) {
      return res.status(400).json({ message: "Validation failed", errors: validation });
    }

    const { title, author, published_year, genre, pages, description } = req.body;

    const pdfFile = req.files?.pdf?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];

    let pdfUrl = book.pdf_url;
    let thumbnailUrl = book.thumbnail_url;

    if (pdfFile) {
      const oldPdfPath = pdfUrl?.split(`${bucketName}/`)[1];
      if (oldPdfPath) {
        await storage.bucket(bucketName).file(oldPdfPath).delete().catch(() => {});
      }
      pdfUrl = await uploadFileToBucket(pdfFile, "pdfs");
    }

    if (thumbnailFile) {
      const oldThumbnailPath = thumbnailUrl?.split(`${bucketName}/`)[1];
      if (oldThumbnailPath) {
        await storage.bucket(bucketName).file(oldThumbnailPath).delete().catch(() => {});
      }
      thumbnailUrl = await uploadFileToBucket(thumbnailFile, "thumbnails");
    }

    await book.update({
      title: title || book.title,
      author: author || book.author,
      published_year: published_year || book.published_year,
      genre: genre || book.genre,
      pages: pages || book.pages,
      description: description || book.description,
      pdf_url: pdfUrl,
      thumbnail_url: thumbnailUrl,
    });

    res.status(200).json({ message: "Book updated successfully", book });
  } catch (err) {
    res.status(500).json({ message: "Error updating book", error: err.message });
  }
};

// GET /books/search - Search books by keyword
const searchBooks = async (req, res) => {
  try {
    const { q } = req.query; // Ambil query parameter `q`
    if (!q) {
      return res.status(400).json({ message: "Query parameter 'q' is required" });
    }

    // Cari kitab berdasarkan kata kunci pada kolom `title`, `author`, atau `description`
    const books = await Book.findAll({
      where: {
        [Op.or]: [
          { title: { [Op.like]: `%${q}%` } },
          { author: { [Op.like]: `%${q}%` } },
          { description: { [Op.like]: `%${q}%` } },
        ],
      },
    });

    // Jika tidak ada hasil, kembalikan pesan
    if (books.length === 0) {
      return res.status(404).json({ message: "No books found matching the query" });
    }

    res.status(200).json(books);
  } catch (err) {
    res.status(500).json({ message: "Error searching books", error: err.message });
  }
};


module.exports = { getAllBooks, getBookById, addBook, deleteBook, updateBook, searchBooks};
