const express = require("express");
var cors = require("cors");
require("dotenv").config();
const admin = require("firebase-admin");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 3000;

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: process.env.CLIENT_DOMAIN,
    credentials: true,
  })
);

app.use(express.json());

const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  // console.log("token-->", token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    // console.log("decoded ----->", decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("eduPlusDB");
    const usersCollection = db.collection("users");
    const tuitionCollection = db.collection("tuitions");
    const applicationsCollection = db.collection("applications");
    const paymentsCollection = db.collection("payments");

    // ******************role middlewares**************//

    const verifyStudent = async (req, res, next) => {
      const email = req.tokenEmail;

      const user = await usersCollection.findOne({ email });
      if (user?.role !== "student") {
        return res
          .status(403)
          .send({ message: "Student only go!", role: user?.role });
      }
      next();
    };
    const verifyTutor = async (req, res, next) => {
      const email = req.tokenEmail;

      const user = await usersCollection.findOne({ email });
      if (user?.role !== "tutor") {
        return res
          .status(403)
          .send({ message: "tutor only go!", role: user?.role });
      }
      next();
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.tokenEmail;

      const user = await usersCollection.findOne({ email });
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ message: "admin only go!", role: user?.role });
      }
      next();
    };

    //user api
    // app.post("/users", async (req, res) => {
    //   try {
    //     const userData = req.body;
    //     userData.created_at = new Date().toString();
    //     userData.last_loggedIn = new Date().toString();
    //     const query = {
    //       email: userData.email,
    //     };
    //     const alreadyExists = await usersCollection.findOne(query);
    //     if (alreadyExists) {
    //       const result = await usersCollection.updateOne(query, {
    //         $set: {
    //           last_loggedIn: new Date().toString(),
    //         },
    //       });
    //       return res.send(result);
    //     }
    //     const result = await usersCollection.insertOne(userData);
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).json({ message: error.message });
    //   }
    // });

    // *********************************************//
    // // *********************************************//
    // // *********************************************//

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("assignment-11-server is running");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
