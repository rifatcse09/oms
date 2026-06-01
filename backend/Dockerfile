FROM composer:2

RUN apk add --no-cache $PHPIZE_DEPS \
    && docker-php-ext-install pdo_mysql \
    && apk del $PHPIZE_DEPS \
    && apk add --no-cache mysql-client \
    && php -m | grep -qi '^pdo_mysql$' || (echo 'ERROR: pdo_mysql not loaded (migrate will fail with could not find driver)' >&2; exit 1)

WORKDIR /app

EXPOSE 8000
