<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-5.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/MongoDB-7.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Firebase_Admin-12.x-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" />
</p>

# 🌾 KrishiLink — Backend API

> **A production-ready RESTful API powering a modern agricultural marketplace that bridges the gap between farmers and buyers.**

🔗 **Live API:** [https://krishi-link-backend.vercel.app](https://krishi-link-backend.vercel.app)

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [Roadmap](#-roadmap)

---

## 🎯 Overview

**KrishiLink Backend** is a scalable Node.js/Express API that provides the complete backend infrastructure for an agricultural trading platform. The system implements a multi-role architecture supporting **Farmers**, **Buyers**, and **Administrators**, each with dedicated functionalities and secured access levels.

### Key Highlights:
- **Role-Based Access Control (RBAC)** — Granular permissions for Admin, Farmer, and Buyer roles
- **Secure Authentication** — Firebase Admin SDK integration for JWT token verification
- **Resource Ownership Validation** — Custom middleware ensures users can only modify their own resources
- **Modular Architecture** — Clean separation of concerns following MVC-like patterns
- **Production Ready** — Deployed on Vercel with serverless function optimization

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│              (React Frontend / Mobile Apps)                     │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                          │
│        ┌──────────────────────────────────────────────┐         │
│        │              Express.js Server               │         │
│        │           (CORS, JSON Parser)                │         │
│        └──────────────────────────────────────────────┘         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MIDDLEWARE PIPELINE                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │verifyToken  │→│attachDbUser │→│ requireRole │→│requireOwner│ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ROUTE MODULES                              │
│    ┌─────────┐  ┌────────────┐  ┌────────┐  ┌──────────────┐    │
│    │  Crops  │  │  Interests │  │  Users │  │   Dashboard  │    │
│    └─────────┘  └────────────┘  └────────┘  └──────────────┘    │
│                        ┌─────────┐                              │
│                        │  Admin  │                              │
│                        └─────────┘                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                 │
│           ┌──────────────────────────────────┐                  │
│           │        MongoDB Atlas             │                  │
│           │   (Crops, Users, Interests)      │                  │
│           └──────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| **Runtime** | Node.js 18+ | JavaScript runtime for server-side execution |
| **Framework** | Express.js 5.x | Minimal, flexible web application framework |
| **Database** | MongoDB 7.0 (Atlas) | NoSQL document database for data persistence |
| **Authentication** | Firebase Admin SDK | Server-side JWT verification & user management |
| **Payment Gateway** | SSLCommerz *(Upcoming)* | Payment processing for Bangladesh market |
| **Deployment** | Vercel | Serverless deployment with edge optimization |
| **Security** | CORS, dotenv | Cross-origin security & environment management |

---

## ✨ Features

### 🔐 Authentication & Authorization
- Firebase ID token verification via middleware
- User synchronization between Firebase Auth and MongoDB
- Multi-role system: `buyer` → `farmer` → `admin`
- Role-upgrade request workflow with admin approval

### 🌾 Crop Management
- Full CRUD operations for crop listings
- Ownership-based authorization for updates/deletes
- Filter options API for dynamic frontend filtering
- Quantity management integrated with interest system

### 💬 Interest System
- Buyers submit purchase interests on crop listings
- Farmers view, accept, or reject incoming interests
- Accepted interests automatically reduce available crop quantity
- Real-time status tracking for both parties

### 📊 Role-Based Dashboards
- **Buyer Dashboard:** Interest statistics, order history
- **Farmer Dashboard:** Crop performance metrics, interest analytics
- **Admin Panel:** Platform overview, user management, moderation tools

### 👥 Admin Controls
- User listing with role and status management
- Farmer role request approval workflow
- Crop moderation and removal capabilities
- Platform-wide analytics overview

---

## 📚 API Reference

### Base URL
```
Production: https://krishi-link-backend.vercel.app
Development: http://localhost:4000
```

### Authentication
All protected routes require a Firebase ID token in the Authorization header:
```http
Authorization: Bearer <firebase_id_token>
```

### Endpoints Overview

#### 🌱 Crops Module
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/sixCrops` | Public | Get 6 latest crops for homepage |
| `GET` | `/allCrops` | Public | Get all crops with pagination/filters |
| `GET` | `/allCrops/filter-options` | Public | Get available filter options |
| `GET` | `/allCrops/:id` | Public | Get single crop details |
| `POST` | `/allCrops` | Farmer | Create new crop listing |
| `GET` | `/myCrops` | Farmer | Get authenticated farmer's crops |
| `PUT` | `/myCrops/:id` | Farmer (Owner) | Update own crop |
| `DELETE` | `/myCrops/:id` | Farmer (Owner) | Delete own crop |

#### 💡 Interests Module
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/allCrops/:id/interests` | Buyer | Submit interest on a crop |
| `GET` | `/myInterests` | Buyer | Get all interests submitted |
| `GET` | `/allCrops/:id/interests` | Farmer (Owner) | Get interests on own crop |
| `PATCH` | `/updateInterestStatus/:cropId/:interestId` | Farmer (Owner) | Accept/Reject interest |

#### 👤 Users Module
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/users/sync` | Authenticated | Sync Firebase user to database |
| `GET` | `/users/me` | Authenticated | Get current user profile |
| `POST` | `/users/request-farmer` | Buyer | Request farmer role upgrade |
| `PATCH` | `/users/request-farmer/cancel` | Buyer | Cancel farmer request |
| `GET` | `/users/me/stats` | Authenticated | Get user-specific statistics |

#### 📊 Dashboard Module
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/dashboard/buyer` | Buyer | Get buyer analytics |
| `GET` | `/dashboard/farmer` | Farmer | Get farmer analytics |

#### 🛡️ Admin Module
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/admin/overview` | Admin | Get platform statistics |
| `GET` | `/admin/users` | Admin | List all users |
| `PATCH` | `/admin/users/:id/status` | Admin | Update user status |
| `PATCH` | `/admin/users/:id/role` | Admin | Change user role |
| `GET` | `/admin/farmer-requests` | Admin | List pending farmer requests |
| `PATCH` | `/admin/farmer-requests/:id/approve` | Admin | Approve farmer request |
| `PATCH` | `/admin/farmer-requests/:id/reject` | Admin | Reject farmer request |
| `GET` | `/admin/crops` | Admin | List all crops for moderation |
| `PATCH` | `/admin/crops/:id/status` | Admin | Change crop status |
| `DELETE` | `/admin/crops/:id` | Admin | Remove crop listing |

---

## 📁 Project Structure

```
KrishiLink-Backend/
├── src/
│   ├── config/
│   │   ├── db.js                 # MongoDB connection setup
│   │   └── firebaseAdmin.js      # Firebase Admin initialization
│   │
│   ├── middlewares/
│   │   ├── verifyFirebaseToken.js  # JWT verification middleware
│   │   ├── attachDbUser.js         # Attach user data from DB
│   │   ├── requireRole.js          # Role-based access control
│   │   └── requireOwnership.js     # Resource ownership validation
│   │
│   ├── modules/
│   │   ├── crops/
│   │   │   ├── crop.controller.js  # Crop business logic
│   │   │   ├── crop.model.js       # Crop data schema
│   │   │   └── crop.routes.js      # Crop route definitions
│   │   │
│   │   ├── interests/
│   │   │   ├── interest.controller.js
│   │   │   ├── interest.model.js
│   │   │   └── interest.routes.js
│   │   │
│   │   ├── users/
│   │   │   ├── user.controller.js
│   │   │   ├── user.model.js
│   │   │   └── user.routes.js
│   │   │
│   │   ├── dashboard/
│   │   │   ├── dashboard.controller.js
│   │   │   └── dashboard.routes.js
│   │   │
│   │   └── admin/
│   │       ├── admin.controller.js
│   │       └── admin.routes.js
│   │
│   ├── utils/                    # Utility functions
│   ├── app.js                    # Express app configuration
│   └── server.js                 # Server entry point
│
├── scripts/                      # Utility scripts
├── vercel.json                   # Vercel deployment config
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18 or higher
- MongoDB Atlas account or local MongoDB instance
- Firebase project with Admin SDK credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/krishilink-backend.git
cd krishilink-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

### Available Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload (nodemon) |
| `npm start` | Start production server |

---

## 🔧 Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=4000

# MongoDB Connection
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/<database>

# Firebase Admin SDK (Base64 encoded service account key)
FIREBASE_ADMIN_KEY_BASE64=<base64_encoded_service_account_json>

# SSLCommerz Payment Gateway (Upcoming)
SSLCOMMERZ_STORE_ID=<your_store_id>
SSLCOMMERZ_STORE_PASSWORD=<your_store_password>
SSLCOMMERZ_IS_LIVE=false
```

---

## 🌐 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy with zero configuration (uses `vercel.json`)

```json
// vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/src/server.js" }]
}
```

### Manual Deployment

```bash
# Build for production (if applicable)
npm start
```

---

## 🗺 Roadmap

- [x] Core CRUD operations for crops
- [x] Role-based authentication system
- [x] Interest/Order management
- [x] Admin dashboard APIs
- [ ] **SSLCommerz payment integration** *(In Progress)*
- [ ] Email notification system
- [ ] Advanced search with Elasticsearch
- [ ] Real-time updates with WebSockets
- [ ] Rate limiting and API throttling
- [ ] Comprehensive API documentation (Swagger)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the ISC License.

---

<p align="center">
  Made with ❤️ for connecting farmers and buyers directly
</p>