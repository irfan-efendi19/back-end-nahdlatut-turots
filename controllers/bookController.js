const { Book } = require('../models');
const { Storage } = require('@google-cloud/storage');
const Validator = require('fastest-validator');

const { Op } = require("sequelize"); 

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


// Upload GCS
const uploadFileToBucket = async (file, folder) => {
  try {
    const bucket = storage.bucket(bucketName);

    let sanitizedFileName = file.originalname.replace(/\+/g, "_").replace(/ /g, "");

    sanitizedFileName = encodeURIComponent(sanitizedFileName);

    const fileName = `${folder}/${Date.now()}-${sanitizedFileName}`;
    const blob = bucket.file(fileName);

    const blobStream = blob.createWriteStream({
      resumable: false,
      gzip: true,
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      blobStream
        .on("finish", () => {
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

    const pdfFile = req.files?.pdf?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];


    const MAX_FILE_SIZE = 1 * 1024 * 1024;

    if (thumbnailFile && thumbnailFile.size > MAX_FILE_SIZE) {
    return res.status(400).json({ message: "ukuran gambar terlalu besar" });
    }

    const pdfUrl = pdfFile
      ? await uploadFileToBucket(pdfFile, "pdfs") 
      : null;
    const thumbnailUrl = thumbnailFile
      ? await uploadFileToBucket(thumbnailFile, "thumbnails")
      : null;

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


const deleteBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const deleteFile = async (fileUrl, fileType) => {
      if (!fileUrl) return;

      try {
        const filePath = decodeURIComponent(fileUrl.replace(`https://storage.googleapis.com/${bucketName}/`, ""));
        const file = storage.bucket(bucketName).file(filePath);

        const [exists] = await file.exists();
        if (!exists) {
          console.warn(`Warning: ${fileType} not found in storage (${filePath})`);
          return;
        }

        await file.delete();
        console.log(`${fileType} deleted successfully: ${filePath}`);
      } catch (err) {
        console.error(`Failed to delete ${fileType}: ${err.message}`);
      }
    };

    // Hapus PDF dan Thumbnail jika ada
    await Promise.all([
      deleteFile(book.pdf_url, "PDF"),
      deleteFile(book.thumbnail_url, "Thumbnail")
    ]);

    // Hapus data buku dari database
    await book.destroy();

    res.status(200).json({ message: "Book deleted successfully" });
  } catch (err) {
    console.error(`Error deleting book: ${err.message}`);
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

    // Validasi input menggunakan schema
    const validation = v.validate(req.body, bookSchema);
    if (validation !== true) {
      return res.status(400).json({ message: "Validation failed", errors: validation.errors });
    }

    const { title, author, published_year, genre, pages, description } = req.body;
    const pdfFile = req.files?.pdf?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];

    let pdfUrl = book.pdf_url;
    let thumbnailUrl = book.thumbnail_url;

    // Fungsi untuk menghapus file lama dari storage
    const deleteFile = async (fileUrl, fileType) => {
      if (!fileUrl) return;

      try {
        const filePath = decodeURIComponent(fileUrl.replace(`https://storage.googleapis.com/${bucketName}/`, ""));
        const file = storage.bucket(bucketName).file(filePath);

        const [exists] = await file.exists();
        if (!exists) {
          console.warn(`Warning: ${fileType} not found in storage (${filePath})`);
          return;
        }

        await file.delete();
        console.log(`${fileType} deleted successfully: ${filePath}`);
      } catch (err) {
        console.error(`Failed to delete ${fileType}: ${err.message}`);
      }
    };

    const deletePromises = [];

    if (pdfFile) {
      deletePromises.push(deleteFile(pdfUrl, "PDF"));
    }
    if (thumbnailFile) {
      deletePromises.push(deleteFile(thumbnailUrl, "Thumbnail"));
    }

    // Tunggu penghapusan selesai sebelum mengunggah file baru
    await Promise.all(deletePromises);

    // Unggah file baru jika ada
    try {
      if (pdfFile) {
        pdfUrl = await uploadFileToBucket(pdfFile, "pdfs");
      }
      if (thumbnailFile) {
        thumbnailUrl = await uploadFileToBucket(thumbnailFile, "thumbnails");
      }
    } catch (uploadError) {
      return res.status(500).json({ message: "Error uploading file", error: uploadError.message });
    }

    // Update data buku
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
    console.error(`Error updating book: ${err.message}`);
    res.status(500).json({ message: "Error updating book", error: err.message });
  }
};


// GET /books/search - Search books by keyword
async function searchBooks() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) {
    loadBooks();
    return;
  }

  try {
    const response = await fetch(`/books/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Failed to search for books');

    // Check if the response is JSON
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Expected JSON response, but received: ' + contentType);
    }

    const books = await response.json();
    renderBooksTable(books);
  } catch (error) {
    showToast('Error', 'Error searching books: ' + error.message, 'danger');
  }
}


// Tambahkan fungsi ini untuk mendapatkan statistik jumlah kitab
const getBookStats = async (req, res) => {
  try {
    // Hitung total jumlah kitab
    const totalBooks = await Book.count();

    // Hitung jumlah kitab berdasarkan genre
    const booksByGenre = await Book.findAll({
      attributes: ['genre', [Sequelize.fn('COUNT', Sequelize.col('genre')), 'count']],
      group: ['genre'],
    });

    // Format hasil untuk dikembalikan dalam response
    const genreStats = booksByGenre.map(book => ({
      genre: book.genre || 'Unknown',
      count: book.dataValues.count
    }));

    res.status(200).json({
      totalBooks,
      booksByGenre: genreStats
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching book statistics", error: err.message });
  }
};


module.exports = { getAllBooks, getBookById, addBook, deleteBook, updateBook, searchBooks, getBookStats };
