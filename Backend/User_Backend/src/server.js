import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { typeDefs, resolvers } from "./graphql/index.js";
import { ConnectDB } from "./config/db.js";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 4000;

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

async function startServer() {
  await ConnectDB();
  await server.start();

  app.use("/graphql", expressMiddleware(server));

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
