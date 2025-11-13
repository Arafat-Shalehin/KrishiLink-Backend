## ⚙️ **Backend README (`server/README.md`)**

```md
# 🌾 KrishiLink Server (Backend API)

### Live API URL: [https://krishi-link-backend.vercel.app/](https://krishi-link-backend.vercel.app/)

This is the backend service for **KrishiLink**, built using **Node.js**, **Express**, and **MongoDB**.  
It handles all API operations including crop management, user interests, and secure data updates.

---

## 🚀 Key Features

- 🌱 **Crop Management API** – Create, read, update, and delete crops seamlessly.
- 💬 **Interest System** – Buyers can express interest in crops; owners receive and manage them.
- ⚙️ **Status Update Route** – Accepting an interest automatically decreases crop quantity.
- 🛡️ **Secure Routes** – Authenticated API access using user email and ownership validation.
- 📡 **Efficient Database Operations** – Optimized MongoDB queries and updates with `ObjectId` handling.

---

## 🧩 Tech Stack

- **Runtime:** Node.js  
- **Framework:** Express.js  
- **Database:** MongoDB (with Mongoose)  
- **Security:** CORS, dotenv  
- **Deployment:** Vercel / Render  

---

## 🧠 Main API Endpoints

| Method | Endpoint | Description |
|--------|-----------|-------------|
| `GET` | `/allCrops` | Fetch all crops |
| `POST` | `/addCrop` | Add a new crop |
| `PATCH` | `/updateCrop/:id` | Update crop details |
| `DELETE` | `/deleteCrop/:id` | Delete a crop |
| `PATCH` | `/updateInterestStatus/:cropId/:interestId` | Update interest status & crop quantity |