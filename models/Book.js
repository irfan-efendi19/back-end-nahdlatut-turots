"use strict";

module.exports = (sequelize, DataTypes) => {
  const Book = sequelize.define(
    "Book",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      author: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      published_year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      genre: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pdf_url: {
        type: DataTypes.STRING, // Untuk menyimpan URL file PDF
        allowNull: true,
      },
      thumbnail_url: {
        type: DataTypes.STRING, // Untuk menyimpan URL thumbnail
        allowNull: true,
      },
    },
    {
      tableName: "books", // Nama tabel di database
      timestamps: true, // Aktifkan createdAt dan updatedAt
      underscored: true, // Gunakan format snake_case untuk kolom
    }
  );

  return Book;
};
