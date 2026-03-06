# Usa la imagen oficial de Node.js
FROM node:18-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de dependencias
COPY package*.json ./

# Instala todas las dependencias
RUN npm install && npm cache clean --force

# Copia el resto del código de la aplicación
COPY . .

# Puerto que expone el servidor
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "tournament-server.js"]
