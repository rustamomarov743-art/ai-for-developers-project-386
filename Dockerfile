FROM node:24.22.2-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM maven:3.9.11-eclipse-temurin-25 AS backend-build

WORKDIR /app

COPY backend/pom.xml pom.xml
COPY backend/.mvn .mvn
RUN mvn -B -ntp dependency:go-offline

COPY backend/src src
COPY --from=frontend-build /frontend/dist src/main/resources/static
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:25-jre

WORKDIR /app

COPY --from=backend-build /app/target/*.jar app.jar

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "exec java -jar /app/app.jar --server.port=${PORT:-8080}"]
