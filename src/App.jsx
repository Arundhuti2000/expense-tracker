import React, { useState, useEffect, useMemo, useRef } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  Trash2,
  Plus,
  DollarSign,
  Calendar,
  MapPin,
  CreditCard,
  Tag,
  Hash,
  AlertCircle,
  TrendingUp,
  Wallet,
  Pencil,
  X,
  Navigation,
  Download,
  Filter,
  ArrowUpDown,
  Layers,
  PieChart as PieChartIcon,
  List,
  BarChart2,
  Search,
  Upload,
  LogOut,
  UserCircle,
  LogIn,
  ShieldCheck,
  Camera,
  Loader2,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Import the functions you need from the SDKs you need
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA9rgjiqxczGfc5gU6dXhP2j5BG0O5gl34",
  authDomain: "expensetracker-2a5ce.firebaseapp.com",
  projectId: "expensetracker-2a5ce",
  storageBucket: "expensetracker-2a5ce.firebasestorage.app",
  messagingSenderId: "1090530086882",
  appId: "1:1090530086882:web:6a6e10e4279d2a3dfef3bb",
  measurementId: "G-V65S8NF00F",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// --- App ID for Firestore ---
const appId = "expense-tracker-v1";

// --- Constants ---
const CATEGORIES = [
  "Food",
  "Gas",
  "Repair",
  "Groceries",
  "Utilities",
  "Entertainment",
  "Other",
];

const COLORS = {
  Food: "#3B82F6", // Blue
  Gas: "#8B5CF6", // Purple
  Repair: "#F97316", // Orange
  Groceries: "#10B981", // Emerald
  Utilities: "#64748B", // Slate
  Entertainment: "#EC4899", // Pink
  Other: "#9CA3AF", // Gray
};

// --- Main Application Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [currentView, setCurrentView] = useState("transactions"); // 'transactions' | 'charts'

  // UI State for Login Screen
  const [showLoginScreen, setShowLoginScreen] = useState(true);

  // Filter & Sort State
  const [sortOrder, setSortOrder] = useState("desc"); // 'desc' (Newest) or 'asc' (Oldest)
  const [filterMonth, setFilterMonth] = useState(""); // '' (All) or 'YYYY-MM'
  const [filterCategory, setFilterCategory] = useState(""); // '' (All) or 'Food', etc.
  const [searchTerm, setSearchTerm] = useState(""); // Search by Place, Address, or ID

  // Gemini AI State
  const [showScanModal, setShowScanModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(
    localStorage.getItem("gemini_api_key") || ""
  );
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");

  // File Upload Ref
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    place: "",
    address: "",
    category: "Food",
    paymentType: "Credit Card",
    transactionId: "",
    reviewLater: false,
  });

  // --- Authentication ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // Check if we have a persisted session
          // We don't auto-sign in anonymously here immediately to allow the Login Screen to show options
          // But we do need *some* auth to read DB if we choose "Guest"
        }
      } catch (err) {
        console.error("Auth error:", err);
        setError("Failed to authenticate. Please refresh.");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // If a user is detected and they are NOT anonymous (meaning they logged in with Google),
      // we can skip the login screen automatically.
      if (currentUser && !currentUser.isAnonymous) {
        setShowLoginScreen(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Login / Logout Handlers ---
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setShowLoginScreen(false);
    } catch (err) {
      console.error("Google login error:", err);
      setError("Failed to sign in with Google: " + err.message);
    }
  };

  const handleGuestLogin = async () => {
    try {
      setLoading(true);
      await signInAnonymously(auth);
      setShowLoginScreen(false);
    } catch (err) {
      console.error("Guest login error:", err);
      setError("Failed to continue as guest.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowLoginScreen(true); // Go back to login screen
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // --- Firestore Data Fetching ---
  useEffect(() => {
    if (!user) return;

    const expensesRef = collection(
      db,
      "artifacts",
      appId,
      "users",
      user.uid,
      "expenses"
    );

    const unsubscribe = onSnapshot(
      expensesRef,
      (snapshot) => {
        const fetchedExpenses = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setExpenses(fetchedExpenses);
      },
      (err) => {
        console.error("Data fetch error:", err);
        setError("Failed to load expenses.");
      }
    );

    return () => unsubscribe();
  }, [user]);

  // --- Logic & Handlers ---

  const generateTransactionId = () => {
    return "TXN-" + Math.floor(100000 + Math.random() * 900000);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Smart Category Logic
    if (name === "place") {
      const lowerValue = value.toLowerCase();
      if (
        lowerValue.includes("lowe's") ||
        lowerValue.includes("lowes") ||
        lowerValue.includes("home depot")
      ) {
        setFormData((prev) => ({ ...prev, [name]: value, category: "Repair" }));
        return;
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split("T")[0],
      amount: "",
      place: "",
      address: "",
      category: "Food",
      paymentType: "Credit Card",
      transactionId: "",
      reviewLater: false,
    });
    setEditingId(null);
  };

  const handleEdit = (expense) => {
    setCurrentView("transactions");
    setFormData({
      date: expense.date,
      amount: expense.amount,
      place: expense.place,
      address: expense.address || "",
      category: expense.category,
      paymentType: expense.paymentType,
      transactionId: expense.transactionId || "",
      reviewLater: expense.reviewLater || false,
    });
    setEditingId(expense.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !formData.amount || !formData.place) return;

    try {
      const expenseData = {
        ...formData,
        amount: parseFloat(formData.amount),
        transactionId: formData.transactionId || generateTransactionId(),
      };

      if (editingId) {
        await updateDoc(
          doc(db, "artifacts", appId, "users", user.uid, "expenses", editingId),
          expenseData
        );
      } else {
        expenseData.createdAt = serverTimestamp();
        await addDoc(
          collection(db, "artifacts", appId, "users", user.uid, "expenses"),
          expenseData
        );
      }

      resetForm();
    } catch (err) {
      console.error("Save error:", err);
      setError("Failed to save expense.");
    }
  };

  const handleDelete = async (docId) => {
    if (!user) return;
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      try {
        await deleteDoc(
          doc(db, "artifacts", appId, "users", user.uid, "expenses", docId)
        );
        if (editingId === docId) resetForm();
      } catch (err) {
        console.error("Delete error:", err);
        alert("Could not delete item.");
      }
    }
  };

  // --- Import / Export Handlers ---

  const handleExport = () => {
    if (processedExpenses.length === 0) return;

    const headers = [
      "Date",
      "Transaction ID",
      "Place",
      "Address",
      "Category",
      "Payment Method",
      "Amount",
      "Review Status",
    ];
    const csvContent = [
      headers.join(","),
      ...processedExpenses.map((e) =>
        [
          e.date,
          e.transactionId,
          `"${(e.place || "").replace(/"/g, '""')}"`,
          `"${(e.address || "").replace(/"/g, '""')}"`,
          e.category,
          e.paymentType,
          e.amount,
          e.reviewLater ? "Review Later" : "Verified",
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `expenses_export_${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r\n|\n/);

        if (lines.length < 2) {
          alert("CSV file seems empty or missing data.");
          return;
        }

        const batch = writeBatch(db);
        const collectionRef = collection(
          db,
          "artifacts",
          appId,
          "users",
          user.uid,
          "expenses"
        );
        let operationCount = 0;
        let successCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const row = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);

          if (!row) continue;

          const cleanRow = row.map((cell) =>
            cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"')
          );

          if (cleanRow.length < 6) continue;

          const date = cleanRow[0] || new Date().toISOString().split("T")[0];
          const transactionId = cleanRow[1] || generateTransactionId();
          const place = cleanRow[2];
          const address = cleanRow[3] || "";
          const category =
            cleanRow[4] && CATEGORIES.includes(cleanRow[4])
              ? cleanRow[4]
              : "Other";
          const paymentType = cleanRow[5] || "Cash";
          const amount = parseFloat(cleanRow[6]);

          if (!place || isNaN(amount)) continue;

          const docRef = doc(collectionRef);
          batch.set(docRef, {
            date,
            transactionId,
            place,
            address,
            category,
            paymentType,
            amount,
            createdAt: serverTimestamp(),
          });

          successCount++;
          operationCount++;

          if (operationCount >= 450) {
            await batch.commit();
            operationCount = 0;
          }
        }

        if (successCount > 0) {
          if (operationCount > 0) await batch.commit();
          alert(`Successfully imported ${successCount} transactions!`);
        } else {
          alert(
            "No valid transactions found to import. Please check CSV format."
          );
        }
      } catch (err) {
        console.error("Import failed:", err);
        alert(
          "Failed to import CSV. Ensure format matches the Export template."
        );
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsText(file);
  };

  // --- Gemini AI Receipt Scanning ---
  const DAILY_SCAN_LIMIT = 20; // Set your daily limit here

  const handleScanReceipts = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // --- Rate Limiting Check ---
    const today = new Date().toISOString().split("T")[0];
    const usageData = JSON.parse(
      localStorage.getItem("gemini_daily_usage") || "{}"
    );

    if (usageData.date !== today) {
      usageData.date = today;
      usageData.count = 0;
    }

    if (usageData.count + files.length > DAILY_SCAN_LIMIT) {
      alert(
        `Daily limit reached! You have used ${usageData.count}/${DAILY_SCAN_LIMIT} scans today.`
      );
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    // ---------------------------

    if (!geminiApiKey) {
      alert("Please enter your Gemini API Key first.");
      return;
    }

    // Save key for future use
    localStorage.setItem("gemini_api_key", geminiApiKey);

    // Update usage count immediately to prevent abuse
    usageData.count += files.length;
    localStorage.setItem("gemini_daily_usage", JSON.stringify(usageData));

    setIsScanning(true);
    setScanStatus(`Processing ${files.length} images...`);

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // Convert images to Base64
      const imageParts = await Promise.all(
        files.map(async (file) => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = reader.result.split(",")[1];
              resolve({
                inlineData: {
                  data: base64Data,
                  mimeType: file.type,
                },
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );

      const prompt = `
        Analyze these receipt images. Extract the following details for each receipt:
        - date (YYYY-MM-DD format, use today's date if not found)
        - amount (number only)
        - place (merchant name)
        - address (merchant address if available, else empty string)
        - category (Choose strictly from: Food, Gas, Repair, Groceries, Utilities, Entertainment, Other)
        - paymentType (Credit Card, Debit Card, Cash)

        Return ONLY a raw JSON array of objects. Do not include markdown formatting like \`\`\`json.
      `;

      setScanStatus("Analyzing with Gemini AI...");
      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const text = response.text();
      console.log("Gemini Raw Response:", text);

      // Clean up markdown if present
      const jsonString = text.replace(/```json|```/g, "").trim();
      let extractedData;
      try {
        extractedData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        throw new Error(
          "Failed to parse AI response. See console for details."
        );
      }

      if (!Array.isArray(extractedData)) {
        throw new Error("Invalid response format from AI");
      }

      setScanStatus(`Saving ${extractedData.length} transactions...`);

      const batch = writeBatch(db);
      const collectionRef = collection(
        db,
        "artifacts",
        appId,
        "users",
        user.uid,
        "expenses"
      );

      let addedCount = 0;
      extractedData.forEach((item) => {
        if (item.place && item.amount) {
          const docRef = doc(collectionRef);
          batch.set(docRef, {
            date: item.date || new Date().toISOString().split("T")[0],
            transactionId: generateTransactionId(),
            place: item.place,
            address: item.address || "",
            category: item.category || "Other",
            paymentType: item.paymentType || "Credit Card",
            amount: parseFloat(item.amount),
            createdAt: serverTimestamp(),
          });
          addedCount++;
        }
      });

      await batch.commit();
      alert(`Successfully scanned and added ${addedCount} receipts!`);
      setShowScanModal(false);
    } catch (err) {
      console.error("Gemini Scan Error:", err);
      alert(`Failed to scan receipts: ${err.message}`);
    } finally {
      setIsScanning(false);
      setScanStatus("");
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  // --- Derived State & Calculations ---

  const availableMonths = useMemo(() => {
    const months = new Set();
    expenses.forEach((exp) => {
      if (exp.date) months.add(exp.date.substring(0, 7)); // YYYY-MM
    });
    return Array.from(months).sort().reverse();
  }, [expenses]);

  const processedExpenses = useMemo(() => {
    let result = [...expenses];

    if (filterMonth)
      result = result.filter((exp) => exp.date.startsWith(filterMonth));
    if (filterCategory)
      result = result.filter((exp) => exp.category === filterCategory);

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(
        (exp) =>
          (exp.place?.toLowerCase() || "").includes(lowerTerm) ||
          (exp.address?.toLowerCase() || "").includes(lowerTerm) ||
          (exp.transactionId?.toLowerCase() || "").includes(lowerTerm)
      );
    }

    result.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [expenses, sortOrder, filterMonth, filterCategory, searchTerm]);

  const totalSpent = useMemo(() => {
    return processedExpenses.reduce(
      (sum, item) => sum + (parseFloat(item.amount) || 0),
      0
    );
  }, [processedExpenses]);

  // --- Chart Data Preparation ---
  const categoryChartData = useMemo(() => {
    const data = {};
    processedExpenses.forEach((exp) => {
      const cat = exp.category || "Other";
      data[cat] = (data[cat] || 0) + parseFloat(exp.amount);
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [processedExpenses]);

  const monthlyChartData = useMemo(() => {
    const data = {};
    processedExpenses.forEach((exp) => {
      if (!exp.date) return;
      const monthKey = exp.date.substring(0, 7); // YYYY-MM
      data[monthKey] = (data[monthKey] || 0) + parseFloat(exp.amount);
    });
    return Object.entries(data)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({
        name,
        shortName: new Date(name + "-01").toLocaleString("default", {
          month: "short",
        }),
        value,
      }));
  }, [processedExpenses]);

  const highestCategory = useMemo(() => {
    if (categoryChartData.length === 0) return { name: "-", value: 0 };
    return categoryChartData.reduce((prev, current) =>
      prev.value > current.value ? prev : current
    );
  }, [categoryChartData]);

  const averageTransaction = useMemo(() => {
    if (processedExpenses.length === 0) return 0;
    return totalSpent / processedExpenses.length;
  }, [totalSpent, processedExpenses]);

  const formatMonth = (monthStr) => {
    const [y, m] = monthStr.split("-");
    const date = new Date(y, m - 1);
    return date.toLocaleString("default", { month: "long", year: "numeric" });
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-500">
        <div className="animate-pulse flex flex-col items-center">
          <Wallet className="w-12 h-12 mb-4 text-emerald-500" />
          <p>Loading application...</p>
        </div>
      </div>
    );

  // --- LOGIN SCREEN ---
  if (showLoginScreen && (!user || user.isAnonymous)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-emerald-100 p-4 rounded-full">
              <Wallet className="w-10 h-10 text-emerald-600" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-800">
              Expense Tracker
            </h1>
            <p className="text-slate-500 text-sm">
              Keep track of your spending effortlessly. <br /> Secure,
              cloud-synced, and simple.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium py-3 rounded-xl transition-all shadow-sm group"
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                className="w-5 h-5 group-hover:scale-110 transition-transform"
              />
              Sign in with Google
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400">Or</span>
              </div>
            </div>

            <button
              onClick={handleGuestLogin}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium py-3 rounded-xl transition-all"
            >
              <UserCircle className="w-5 h-5" />
              Continue as Guest
            </button>
          </div>

          <p className="text-xs text-slate-400 pt-4">
            Guest data is saved to your browser session but may be lost if you
            clear your cache.
          </p>
        </div>
      </div>
    );
  }

  // --- DASHBOARD ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      {/* --- SCAN MODAL --- */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-6 h-6 text-indigo-600" />
                Scan Receipts with AI
              </h2>
              <button
                onClick={() => setShowScanModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Enter your Gemini API Key"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
                <p className="text-xs text-slate-500">
                  Your key is saved locally in your browser. Get one from{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    Google AI Studio
                  </a>
                  .
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors relative">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  ref={imageInputRef}
                  onChange={handleScanReceipts}
                  disabled={isScanning || !geminiApiKey}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                {isScanning ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-sm font-medium text-indigo-600">
                      {scanStatus}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-indigo-50 p-3 rounded-full">
                      <Upload className="w-6 h-6 text-indigo-600" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      Click to upload receipt images
                    </p>
                    <p className="text-xs text-slate-400">
                      Supports JPG, PNG, WEBP
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowScanModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
              <Wallet className="w-8 h-8 text-emerald-600" />
              Expense Tracker
            </h1>
            <p className="text-slate-500 text-sm mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Private Dashboard
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* --- PROFILE SECTION --- */}
            <div className="flex items-center gap-3 bg-white pl-3 pr-2 py-1.5 rounded-xl border border-slate-200 shadow-sm mr-2">
              <div className="flex items-center gap-2">
                {user && user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="User"
                    className="w-8 h-8 rounded-full border border-slate-100"
                  />
                ) : (
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                    <UserCircle className="w-5 h-5 text-slate-400" />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-700 leading-tight">
                    {user && !user.isAnonymous
                      ? user.displayName || "User"
                      : "Guest"}
                  </span>
                  <span className="text-[10px] text-slate-400 leading-tight">
                    {user && !user.isAnonymous
                      ? "Pro Account"
                      : "Local Session"}
                  </span>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-200 mx-1"></div>

              {user && !user.isAnonymous ? (
                <button
                  onClick={handleLogout}
                  className="p-1.5 hover:bg-slate-100 hover:text-red-500 rounded-lg text-slate-500 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleLogout} // Logout brings back the login screen
                  className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-medium transition-colors"
                >
                  <LogIn className="w-3 h-3" />
                  Sign In
                </button>
              )}
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              <button
                onClick={() => setCurrentView("transactions")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === "transactions"
                    ? "bg-slate-100 text-slate-800 shadow-sm"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                onClick={() => setCurrentView("charts")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentView === "charts"
                    ? "bg-slate-100 text-slate-800 shadow-sm"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <PieChartIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Charts</span>
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2 border border-red-200">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Global Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-full">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Total Spent
              </p>
              <p className="text-2xl font-bold text-slate-800">
                ${totalSpent.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <Tag className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Top Category
              </p>
              <p className="text-lg font-bold text-slate-800">
                {highestCategory.name}
              </p>
              <p className="text-xs text-slate-500">
                ${highestCategory.value.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-full">
              <Hash className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold">
                Avg. Transaction
              </p>
              <p className="text-xl font-bold text-slate-800">
                ${averageTransaction.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* --- VIEW: CHARTS --- */}
        {currentView === "charts" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-slate-500" />
                  Spending by Category
                </h3>
                <div className="h-[300px] w-full">
                  {categoryChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[entry.name] || COLORS.Other}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => `$${value.toFixed(2)}`}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      No data available
                    </div>
                  )}
                </div>
              </div>

              {/* Bar Chart */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-slate-500" />
                  Monthly Trend
                </h3>
                <div className="h-[300px] w-full">
                  {monthlyChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#E2E8F0"
                        />
                        <XAxis
                          dataKey="shortName"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#64748B", fontSize: 12 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#64748B", fontSize: 12 }}
                          tickFormatter={(value) => `$${value}`}
                        />
                        <Tooltip
                          cursor={{ fill: "#F1F5F9" }}
                          formatter={(value) => [
                            `$${value.toFixed(2)}`,
                            "Spent",
                          ]}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Bar
                          dataKey="value"
                          fill="#10B981"
                          radius={[4, 4, 0, 0]}
                          barSize={40}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      No data available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW: TRANSACTIONS --- */}
        {currentView === "transactions" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Input Form */}
            <section className="lg:col-span-1">
              <div
                className={`rounded-2xl shadow-sm border p-6 sticky top-6 transition-colors duration-300 ${
                  editingId
                    ? "bg-amber-50 border-amber-200"
                    : "bg-white border-slate-200"
                }`}
              >
                <div className="flex justify-between items-center mb-4">
                  <h2
                    className={`text-lg font-semibold flex items-center gap-2 ${
                      editingId ? "text-amber-700" : "text-slate-800"
                    }`}
                  >
                    {editingId ? (
                      <Pencil className="w-5 h-5" />
                    ) : (
                      <Plus className="w-5 h-5 text-emerald-500" />
                    )}
                    {editingId ? "Edit Transaction" : "New Transaction"}
                  </h2>
                  {editingId && (
                    <button
                      onClick={resetForm}
                      className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 font-medium"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Date */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">
                      Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="date"
                        name="date"
                        required
                        value={formData.date}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  {/* Transaction ID */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">
                      Transaction / Ref ID
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        name="transactionId"
                        placeholder="Optional (Auto-generated if empty)"
                        value={formData.transactionId}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm font-mono"
                      />
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">
                      Amount
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        name="amount"
                        placeholder="0.00"
                        step="0.01"
                        required
                        value={formData.amount}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm font-mono"
                      />
                    </div>
                  </div>

                  {/* Place */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">
                      Place / Merchant
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        name="place"
                        placeholder="e.g. Shell, Lowe's"
                        required
                        value={formData.place}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">
                      Address / Location
                    </label>
                    <div className="relative">
                      <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        name="address"
                        placeholder="e.g. 123 Main St"
                        value={formData.address}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">
                      Category
                    </label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm bg-white appearance-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Payment Type */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase">
                      Payment Method
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        name="paymentType"
                        value={formData.paymentType}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm bg-white appearance-none"
                      >
                        <option value="Credit Card">Credit Card</option>
                        <option value="Debit Card">Debit Card</option>
                        <option value="Cash">Cash</option>
                        <option value="Transfer">Bank Transfer</option>
                      </select>
                    </div>
                  </div>

                  {/* Review Later Checkbox */}
                  <div className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      id="reviewLater"
                      name="reviewLater"
                      checked={formData.reviewLater}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          reviewLater: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <label
                      htmlFor="reviewLater"
                      className="text-sm text-slate-700 font-medium cursor-pointer"
                    >
                      Mark for Review Later
                    </label>
                  </div>

                  <button
                    type="submit"
                    className={`w-full font-medium py-3 rounded-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-2 
                      ${
                        editingId
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                  >
                    {editingId ? (
                      <Pencil className="w-5 h-5" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                    {editingId ? "Update Transaction" : "Add Transaction"}
                  </button>
                </form>
              </div>
            </section>

            {/* List View */}
            <section className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Controls Toolbar */}
                <div className="p-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/50">
                  <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center">
                    {/* Search Filter */}
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search Place, Address, or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>

                    {/* Sort Filter */}
                    <div className="relative min-w-[140px]">
                      <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
                      >
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                      </select>
                    </div>

                    {/* Month Filter */}
                    <div className="relative min-w-[150px]">
                      <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
                      >
                        <option value="">All Months</option>
                        {availableMonths.map((month) => (
                          <option key={month} value={month}>
                            {formatMonth(month)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Category Filter */}
                    <div className="relative min-w-[140px]">
                      <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none appearance-none cursor-pointer hover:border-emerald-300 transition-colors"
                      >
                        <option value="">All Categories</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 w-full xl:w-auto">
                    {/* Hidden File Input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".csv"
                      className="hidden"
                    />

                    {/* Import Button */}
                    <button
                      onClick={handleImportClick}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap flex-1 xl:flex-initial"
                    >
                      <Upload className="w-4 h-4" />
                      Import CSV
                    </button>

                    {/* Scan Receipts Button */}
                    <button
                      onClick={() => setShowScanModal(true)}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 text-sm font-medium rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap flex-1 xl:flex-initial"
                    >
                      <Camera className="w-4 h-4" />
                      Scan Receipts
                    </button>

                    {/* Export Button */}
                    <button
                      onClick={handleExport}
                      disabled={processedExpenses.length === 0}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-1 xl:flex-initial"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                  </div>
                </div>

                {/* Table Header Summary */}
                <div className="px-6 py-3 border-b border-slate-100 bg-white flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-slate-700 truncate mr-2">
                    {filterMonth || filterCategory || searchTerm
                      ? "Filtered Results"
                      : "All Transactions"}
                  </h2>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full whitespace-nowrap">
                    {processedExpenses.length} records
                  </span>
                </div>

                <div className="overflow-x-auto">
                  {processedExpenses.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Tag className="w-8 h-8 text-slate-300" />
                      </div>
                      <p>No transactions found for this selection.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-6 py-3 font-medium">Date</th>
                          <th className="px-6 py-3 font-medium">Details</th>
                          <th className="px-6 py-3 font-medium hidden md:table-cell">
                            Category
                          </th>
                          <th className="px-6 py-3 font-medium hidden sm:table-cell">
                            Payment
                          </th>
                          <th className="px-6 py-3 font-medium text-right">
                            Amount
                          </th>
                          <th className="px-6 py-3 font-medium w-20">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {processedExpenses.map((expense) => (
                          <tr
                            key={expense.id}
                            className={`transition-colors group ${
                              editingId === expense.id
                                ? "bg-amber-50"
                                : expense.reviewLater
                                ? "bg-yellow-50 hover:bg-yellow-100"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            {/* Date */}
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 align-top">
                              {expense.date}
                            </td>

                            {/* Details (Place + Address + ID) */}
                            <td className="px-6 py-4 align-top">
                              <div className="font-medium text-slate-800">
                                {expense.place}
                              </div>
                              {expense.address && (
                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Navigation className="w-3 h-3" />
                                  {expense.address}
                                </div>
                              )}
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                                <Hash className="w-3 h-3" />
                                {expense.transactionId}
                              </div>
                              {/* Mobile only sub-details */}
                              <div className="md:hidden text-xs text-slate-500 mt-1">
                                {expense.category} • {expense.paymentType}
                              </div>
                            </td>

                            {/* Category (Desktop) */}
                            <td className="px-6 py-4 hidden md:table-cell align-top">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                ${
                                  expense.category === "Repair"
                                    ? "bg-orange-100 text-orange-800"
                                    : expense.category === "Food"
                                    ? "bg-blue-100 text-blue-800"
                                    : expense.category === "Gas"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-slate-100 text-slate-800"
                                }`}
                              >
                                {expense.category}
                              </span>
                            </td>

                            {/* Payment (Desktop) */}
                            <td className="px-6 py-4 text-slate-500 hidden sm:table-cell align-top">
                              {expense.paymentType}
                            </td>

                            {/* Amount */}
                            <td className="px-6 py-4 text-right font-mono font-medium text-slate-800 align-top">
                              ${parseFloat(expense.amount).toFixed(2)}
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 text-right align-top">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const newStatus = !expense.reviewLater;
                                    try {
                                      await updateDoc(
                                        doc(
                                          db,
                                          "artifacts",
                                          appId,
                                          "users",
                                          user.uid,
                                          "expenses",
                                          expense.id
                                        ),
                                        {
                                          reviewLater: newStatus,
                                        }
                                      );
                                    } catch (err) {
                                      console.error(
                                        "Error updating status:",
                                        err
                                      );
                                    }
                                  }}
                                  className={`p-1 transition-colors ${
                                    expense.reviewLater
                                      ? "text-yellow-500 hover:text-yellow-600"
                                      : "text-slate-300 hover:text-yellow-500"
                                  }`}
                                  title={
                                    expense.reviewLater
                                      ? "Mark as Verified"
                                      : "Mark for Review"
                                  }
                                >
                                  <AlertCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleEdit(expense)}
                                  className="text-slate-300 hover:text-amber-500 transition-colors p-1"
                                  title="Edit Transaction"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(expense.id)}
                                  className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                  title="Delete Transaction"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
