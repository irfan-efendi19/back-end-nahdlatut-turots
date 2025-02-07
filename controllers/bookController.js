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


// DELETE /books/:id - Delete book by ID
const deleteBook = async (req, res) => {
  try {
    const book = await Book.findByPk(req.params.id);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    const deletePromises = [];

    if (book.pdf_url) {
      const pdfPath = book.pdf_url.replace(`https://storage.googleapis.com/${bucketName}/`, '');
      if (pdfPath) {
        deletePromises.push(
          storage.bucket(bucketName).file(pdfPath).delete().catch((err) => {
            console.error(`Failed to delete PDF: ${err.message}`);
          })
        );
      }
    }

    if (book.thumbnail_url) {
      const thumbnailPath = book.thumbnail_url.replace(`https://storage.googleapis.com/${bucketName}/`, '');
      if (thumbnailPath) {
        deletePromises.push(
          storage.bucket(bucketName).file(thumbnailPath).delete().catch((err) => {
            console.error(`Failed to delete thumbnail: ${err.message}`);
          })
        );
      }
    }

    await Promise.all(deletePromises);

    // Hapus buku dari database setelah file berhasil dihapus
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

    const deletePromises = [];

    if (pdfFile) {
      if (pdfUrl) {
        const oldPdfPath = pdfUrl.replace(`https://storage.googleapis.com/${bucketName}/`, '');
        deletePromises.push(storage.bucket(bucketName).file(oldPdfPath).delete().catch(err => console.error("Failed to delete old PDF:", err.message)));
      }
      pdfUrl = await uploadFileToBucket(pdfFile, "pdfs");
    }

    if (thumbnailFile) {
      if (thumbnailUrl) {
        const oldThumbnailPath = thumbnailUrl.replace(`https://storage.googleapis.com/${bucketName}/`, '');
        deletePromises.push(storage.bucket(bucketName).file(oldThumbnailPath).delete().catch(err => console.error("Failed to delete old Thumbnail:", err.message)));
      }
      thumbnailUrl = await uploadFileToBucket(thumbnailFile, "thumbnails");
    }

    // Tunggu semua file lama terhapus sebelum update database
    await Promise.all(deletePromises);

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
