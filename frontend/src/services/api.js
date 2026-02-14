import axios from 'axios'


const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://15.206.74.151/api'
// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 120000
})

// Handle response errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data)
      if (error.response.status === 401) {
        if (window.location.pathname !== '/' && window.location.pathname !== '/admin-login') {
          window.location.href = '/';
        }
      }
    } else if (error.request) {
      console.error('Network Error: No response from server')
    } else {
      console.error('Error:', error.message)
    }
    return Promise.reject(error)
  }
)

// ===== AUTH API =====
export const authAPI = {
  // Logout
  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.error('Logout failed', error)
    }
  },

  // Send OTP
  sendOTP: async (data) => {
    try {
      const payload = {
        email: data.email || null,
        rollNo: data.rollNo || null,
        userType: data.userType || 'student'
      }
      const response = await api.post('/auth/send-otp', payload)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to send OTP' }
    }
  },

  // Verify Email with OTP
  verifyEmail: async (email, otp, userType) => {
    try {
      const payload = {
        email: email,
        otp: otp,
        userType: userType || 'student'
      }

      const response = await api.post('/auth/verify-email', payload)
      return response.data
    } catch (error) {
      // console.error('❌ Verify OTP Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'OTP verification failed' }
    }
  }
}

// ===== APPLICATION API =====
export const applicationAPI = {

  submit: async (formData, onUploadProgress) => {
    try {
      console.log('📤 Submitting application...')

      const response = await api.post('/applications/submit', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 120000,  // 2 minutes
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          if (onUploadProgress) {
            onUploadProgress(percentCompleted)
          }
          console.log(`Upload Progress: ${percentCompleted}%`)
        }
      })

      console.log('✅ Application submitted:', response.data)
      return response.data
    } catch (error) {
      console.error('❌ Submit Application Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Application submission failed' }
    }
  },
 
  getById: async (id) => {
    try {
      const response = await api.get(`/applications/status/${id}`)
      return response.data
    } catch (error) {
      console.error('❌ Get Application Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to fetch application' }
    }
  }
}

// ===== ADMIN API =====
export const adminAPI = {
  login: async (username, password) => {
    try {
      console.log('📤 Admin Login Request:', { username })

      const response = await api.post('/auth/admin-login', { username, password })
      return response.data
    } catch (error) {
      console.error('❌ Admin Login Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Invalid credentials' }
    }
  },

  // Admin Forgot Password
  forgotPassword: async (email) => {
    try {
      console.log('📤 Admin Forgot Password:', { email })

      const response = await api.post('/auth/admin-forgot-password', { email })
      console.log('✅ Forgot Password Response:', response.data)
      return response.data
    } catch (error) {
      console.error('❌ Forgot Password Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to send reset OTP' }
    }
  },

  // Admin Reset Password
  resetPassword: async (email, otp, newPassword) => {
    try {
      console.log('📤 Admin Reset Password:', { email })

      const response = await api.post('/auth/admin-reset-password', {
        email,
        otp,
        newPassword
      })
      console.log('✅ Reset Password Response:', response.data)
      return response.data
    } catch (error) {
      console.error('❌ Reset Password Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to reset password' }
    }
  },

  // Get All Applications
  getApplications: async (filters = {}) => {
    try {
      const response = await api.get('/admin/applications', { params: filters })
      return response.data
    } catch (error) {
      console.error('❌ Get Applications Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to fetch applications' }
    }
  },

  // Get Dashboard Stats
  getDashboardStats: async () => {
    try {
      const response = await api.get('/admin/dashboard/stats')
      return response.data
    } catch (error) {
      console.error('❌ Get Stats Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to fetch stats' }
    }
  },

  // Update Application Status
  updateStatus: async (id, status, reason = null) => {
    try {
      const response = await api.patch(`/admin/applications/${id}/status`, {
        status,
        reason
      })
      return response.data
    } catch (error) {
      console.error('❌ Update Status Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to update status' }
    }
  },

  // Delete Application (Soft)
  softDelete: async (id) => {
    try {
      const response = await api.delete(`/admin/applications/${id}`, {
        data: { hardDelete: false }
      })
      return response.data
    } catch (error) {
      console.error('❌ Soft Delete Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to delete application' }
    }
  },

  // Delete Application (Hard)
  hardDelete: async (id) => {
    try {
      const response = await api.delete(`/admin/applications/${id}`, {
        data: { hardDelete: true }
      })
      return response.data
    } catch (error) {
      console.error('❌ Hard Delete Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to permanently delete application' }
    }
  },

  // Create New Admin
  createAdmin: async (username, email, password) => {
    try {
      console.log('📤 Creating admin:', { username, email })

      const response = await api.post('/admin/admins', {
        username,
        email,
        password
      })
      console.log('✅ Admin created:', response.data)
      return response.data
    } catch (error) {
      console.error('❌ Create Admin Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to create admin' }
    }
  },

  // Get All Admins
  getAllAdmins: async () => {
    try {
      const response = await api.get('/admin/admins')
      return response.data
    } catch (error) {
      console.error('❌ Get Admins Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to fetch admins' }
    }
  },

  // Delete Admin
  deleteAdmin: async (id) => {
    try {
      const response = await api.delete(`/admin/admins/${id}`)
      return response.data
    } catch (error) {
      console.error('❌ Delete Admin Error:', error.response?.data || error.message)
      throw error.response?.data || { message: 'Failed to delete admin' }
    }
  }
}

export default api
