import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to include the JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  requestOtp: async (email: string) => {
    const response = await api.post("/request-otp", { email });
    return response.data;
  },
  verifyOtp: async (email: string, otp: string) => {
    const response = await api.post("/verify-otp", { email, otp });
    return response.data; // { token, user_id }
  },
};

export const userApi = {
  getRecentChats: async () => {
    const response = await api.get("/users/recent");
    return response.data;
  },
  searchUsers: async (query: string) => {
    const response = await api.get(`/users/search?username=${query}`);
    return response.data;
  },
  getProfile: async () => {
    const response = await api.get("/users/profile");
    return response.data;
  },
  updateProfile: async (data: any) => {
    const response = await api.put("/users/profile", data);
    return response.data;
  },
};

export const messageApi = {
  getChatHistory: async (chatId: string) => {
    const response = await api.get(`/messages/${chatId}`);
    return response.data;
  },
};

export const mediaApi = {
  uploadEncryptedFile: async (fileBlob: Blob, filename: string) => {
    const formData = new FormData();
    formData.append("file", fileBlob, filename);
    const response = await api.post("/media/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data; // { url, filename }
  },
  fetchBlob: async (url: string) => {
    const response = await axios.get(url, { responseType: "blob" });
    return response.data;
  },
};

export default api;
