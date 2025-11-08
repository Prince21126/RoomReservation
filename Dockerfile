cat > Dockerfile << 'EOF'
# Image PHP + Apache
FROM php:8.2-apache

# Installer extensions MySQL nécessaires
RUN docker-php-ext-install mysqli pdo pdo_mysql

# Copier le contenu du dépôt dans /var/www/html
# Si ton site est dans un dossier public/, remplace la ligne COPY par la ligne commentée juste dessous.
COPY . /var/www/html/
# COPY public/ /var/www/html/

# Définir les permissions
RUN chown -R www-data:www-data /var/www/html

# Activer la réécriture d'URL si tu utilises .htaccess
RUN a2enmod rewrite

EXPOSE 80

# Commande par défaut (Apache est lancé par l'image officielle)
EOF
