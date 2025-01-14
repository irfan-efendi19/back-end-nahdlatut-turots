'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('books', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      title: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      author: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      published_year: {
        allowNull: false,
        type: Sequelize.INTEGER,
      },
      genre: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      pages: {
        type: Sequelize.INTEGER,
        allowNull: true, 
      },
      description: {
        type: Sequelize.STRING(9000), 
        allowNull: true, 
      },
      pdf_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      thumbnail_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'), // Set default value ke waktu saat ini
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'), // Set default value ke waktu saat ini
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('books');
  },
};
