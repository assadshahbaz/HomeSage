#!/bin/bash
# Creates the account the API connects with. It may read the property data and
# nothing else: no inserts, updates, deletes or schema changes. The import tool
# is the only thing that writes, and it connects as root.
#
# Docker runs this once, when the data volume is first created. To apply it to a
# database that already exists, run the same statements by hand or recreate the
# volume with: docker compose down --volumes
set -euo pipefail

: "${MYSQL_RO_USER:?MYSQL_RO_USER is not set}"
: "${MYSQL_RO_PASSWORD:?MYSQL_RO_PASSWORD is not set}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is not set}"

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${MYSQL_RO_USER}'@'%' IDENTIFIED BY '${MYSQL_RO_PASSWORD}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${MYSQL_RO_USER}'@'%';
GRANT SELECT ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_RO_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "Created read only user ${MYSQL_RO_USER} with SELECT on ${MYSQL_DATABASE}"
