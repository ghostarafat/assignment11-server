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
    app.post("/users", async (req, res) => {
      try {
        const userData = req.body;
        userData.created_at = new Date().toString();
        userData.last_loggedIn = new Date().toString();

        if (!userData.role) {
          userData.role = "student";
        }

        const query = { email: userData.email };
        const alreadyExists = await usersCollection.findOne(query);

        if (alreadyExists) {
          const result = await usersCollection.updateOne(query, {
            $set: { last_loggedIn: new Date().toString() },
          });
          return res.send(result);
        }

        const result = await usersCollection.insertOne(userData);
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    // app.post("/users", async (req, res) => {
    //   try {
    //     const userData = req.body;

    //     userData.created_at = new Date().toString();
    //     userData.last_loggedIn = new Date().toString();

    //     if (!userData.role) {
    //       userData.role = "student";
    //     }

    //     const query = { email: userData.email };
    //     const alreadyExists = await usersCollection.findOne(query);

    //     if (alreadyExists) {
    //       const result = await usersCollection.updateOne(query, {
    //         $set: { last_loggedIn: new Date().toString() },
    //       });
    //       return res.send(result);
    //     }

    //     const result = await usersCollection.insertOne(userData);
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).json({ message: error.message });
    //   }
    // });
    app.get("/all-tuitions", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { class: className, subject, location } = req.query;

        // Admin filter
        const isAdmin = req.query.admin === "true";
        let filter = isAdmin ? {} : { status: "approved" };
        // Add filters if provided
        if (className) filter.tuitionClass = className;
        if (subject) filter.tuitionSubject = subject;
        if (location) filter.location = location;

        const total = await tuitionCollection.countDocuments(filter);

        const tuitions = await tuitionCollection
          .find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          success: true,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          tuitions,
        });
      } catch (error) {
        console.error("Error fetching tuitions:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    //user get by role

    app.get("/user/role", verifyJWT, async (req, res) => {
      const result = await usersCollection.findOne({ email: req.tokenEmail });

      res.send({ role: result?.role });
    });
    app.get("/tutors", async (req, res) => {
      try {
        const tutors = await usersCollection.find({ role: "tutor" }).toArray();

        res.send(tutors);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch tutors" });
      }
    });
    app.get("/latest-tutors", async (req, res) => {
      try {
        const tutors = await usersCollection
          .find({ role: "tutor" })
          .sort({ created_at: -1 })
          .limit(6)
          .toArray();

        res.send(tutors);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch tutors" });
      }
    });
    app.get("/tutors/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const tutors = await usersCollection.findOne({ _id: new ObjectId(id) });

        res.send(tutors);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch tutors" });
      }
    });

    // *******************************************
    // ************ Admin  apis ********************
    // *********************************************//
    app.get("/all-users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection
        .find()
        .sort({ created_at: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/users-details/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.findOne({ _id: new ObjectId(id) });

      res.send(result);
    });

    app.patch("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

    app.delete("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

      res.send(result);
    });
    app.get("/all-payment", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result);
    });

    // *******************************************
    // ************ tuitions apis ********************
    // *********************************************//
    // ********************* all tuitions get*************//

    app.get("/all-tuitions-admin", async (req, res) => {
      const isAdmin = req.query.admin === "true";
      const filter = isAdmin ? {} : { status: "approved" };
      const result = await tuitionCollection
        .find(filter)
        .sort({ created_at: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/all-tuition", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Admin filter
        const isAdmin = req.query.admin === "true";
        const filter = isAdmin ? {} : { status: "approved" };

        const total = await tuitionCollection.countDocuments(filter);

        // Fetch paginated data
        const tuitions = await tuitionCollection
          .find(filter)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          success: true,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          tuitions,
        });
      } catch (error) {
        console.error("Error fetching tuitions:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    app.get("/latest-tuitions", async (req, res) => {
      const isAdmin = req.query.admin === "true";
      const filter = isAdmin ? {} : { status: "approved" };
      const result = await tuitionCollection
        .find(filter)
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/tuitions-details/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await tuitionCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).send({ message: "Tuition not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching tuition:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // *********************tuitions apis status update*************//

    app.patch("/tuition-status/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      try {
        const result = await tuitionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true });
        } else {
          res.send({ success: false, message: "No document updated" });
        }
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // *********************tuitions apis post*************//
    app.post("/tuitions", verifyJWT, verifyStudent, async (req, res) => {
      const tuitionsData = req.body;
      tuitionsData.status = "pending";
      tuitionsData.created_at = new Date();
      const result = await tuitionCollection.insertOne(tuitionsData);
      res.send(result);
    });
    // *********************tuitions apis get*************//
    app.get("/tuitions", verifyJWT, verifyStudent, async (req, res) => {
      const email = req.tokenEmail;
      const { status } = req.query;

      const query = { studentEmail: email };

      if (status) {
        query.status = status;
      }

      const result = await tuitionCollection.find(query).toArray();
      res.send(result);
    });

    // *********************tuitions apis update*************//
    app.patch("/tuitions/:id", verifyJWT, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await tuitionCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

    // *********************tuitions apis delete*************//
    app.delete("/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tuitionCollection.deleteOne(query);

      res.send(result);
    });
    // *******************************************
    // ************ Tutor apis ********************
    // *********************************************//

    app.post("/applications", verifyJWT, async (req, res) => {
      try {
        const applicationData = req.body;

        applicationData.appliedAt = new Date();
        applicationData.applicantEmail = req.tokenEmail;
        applicationData.status = "pending";

        const result = await applicationsCollection.insertOne(applicationData);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Application submit error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to submit application",
        });
      }
    });

    app.get("/applications", verifyJWT, verifyTutor, async (req, res) => {
      const email = req.tokenEmail;
      const result = await applicationsCollection
        .find({ tutorEmail: email })
        .toArray();
      res.send(result);
    });

    app.get("/my-applications", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;

      const result = await applicationsCollection
        .find({ studentEmail: email })
        .toArray();

      res.send(result);
    });
    app.get("/my-applications/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const result = await applicationsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    app.patch("/applications/status/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      const result = await applicationsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { status: status },
        }
      );

      res.send(result);
    });

    app.get(
      "/tutor-ongoing-tuitions",
      verifyJWT,
      verifyTutor,
      async (req, res) => {
        const tutorEmail = req.tokenEmail;

        const result = await applicationsCollection
          .find({
            tutorEmail: tutorEmail,
            status: "approved",
          })
          .toArray();

        res.send(result);
      }
    );
    app.get("/payment-tutor", verifyJWT, verifyTutor, async (req, res) => {
      const email = req.tokenEmail;
      // console.log("payment  email ----------->", email);

      const result = await paymentsCollection
        .find({
          tutorEmail: email,
        })
        .toArray();
      res.send(result);
    });

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
