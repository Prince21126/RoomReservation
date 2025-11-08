# Image PHP + Apache
FROM php:8.2-apache

# Installer les extensions MySQL nécessaires
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Copier le contenu du dépôt dans /var/www/html
COPY . /var/www/html/

# Définir les permissions
RUN chown -R www-data:www-data /var/www/html

# Activer la réécriture d’URL (utile pour .htaccess)
RUN a2enmod rewrite

# Exposer le port 80
EXPOSE 80
