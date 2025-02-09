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
        allowNull: true,
      },
      genre: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pages: {
        type: DataTypes.INTEGER, 
        allowNull: true, 
      },
      description: {
        type: DataTypes.STRING(9000), 
        allowNull: true, 
      },
      pdf_url: {
        type: DataTypes.STRING, 
        allowNull: true,
      },
      thumbnail_url: {
        type: DataTypes.STRING, 
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
