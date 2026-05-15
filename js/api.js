// GarDIY API Handler - Connects frontend to backend
// Replace localStorage with backend database storage

const API_BASE_URL = 'http://localhost:5000/api';

// Returns Authorization header if a session token exists
const getAuthHeader = () => {
  try {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    return session.token ? { 'Authorization': `Bearer ${session.token}` } : {};
  } catch { return {}; }
};

// ==================== PRODUCTS API ====================

const ProductAPI = {
  // Get all products from backend
  async getAll() {
    try {
      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await response.json();
      
      if (data.success) {
        return data.products;
      }
      throw new Error(data.message || 'Failed to fetch products');
    } catch (error) {
      console.error('Error fetching products:', error);
      return [];
    }
  },

  // Create new product
  async create(product) {
    try {
      const response = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(product)
      });
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  },

  // Bulk import products (for migration from localStorage)
  async bulkImport(products) {
    try {
      const response = await fetch(`${API_BASE_URL}/products/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ products })
      });
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error importing products:', error);
      throw error;
    }
  },

  // Delete product
  async delete(productId) {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() }
      });
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }
};

// ==================== DESIGNS API ====================

const DesignAPI = {
  // Save design to backend
  async save(designData) {
    try {
      const response = await fetch(`${API_BASE_URL}/designs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'guest',
          designName: designData.designName || 'My Design',
          items: designData.items || [],
          landscapeImageData: designData.image || null
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Design saved to database!', data.designId);
        return data;
      }
      throw new Error(data.message || 'Failed to save design');
    } catch (error) {
      console.error('Error saving design:', error);
      throw error;
    }
  },

  // Load latest design
  async loadLatest() {
    try {
      const response = await fetch(`${API_BASE_URL}/designs?userId=guest`);
      const data = await response.json();
      
      if (data.success && data.designs.length > 0) {
        return data.designs[0]; // Return most recent
      }
      return null;
    } catch (error) {
      console.error('Error loading design:', error);
      return null;
    }
  },

  // Get all designs
  async getAll() {
    try {
      const response = await fetch(`${API_BASE_URL}/designs?userId=guest`);
      const data = await response.json();
      
      if (data.success) {
        return data.designs;
      }
      return [];
    } catch (error) {
      console.error('Error fetching designs:', error);
      return [];
    }
  },

  // Delete design
  async delete(designId) {
    try {
      const response = await fetch(`${API_BASE_URL}/designs/${designId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting design:', error);
      throw error;
    }
  }
};

// ==================== IMAGES API ====================

const ImageAPI = {
  // Upload image as base64
  async uploadBase64(imageData, usedFor = 'landscape') {
    try {
      const response = await fetch(`${API_BASE_URL}/images/upload-base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData,
          usedFor,
          userId: 'guest'
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Image uploaded!', data.filename);
        return data;
      }
      throw new Error(data.message || 'Failed to upload image');
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  },

  // Get image URL
  getImageUrl(filename) {
    return `${API_BASE_URL}/images/${filename}`;
  },

  // Get all user images
  async getAll() {
    try {
      const response = await fetch(`${API_BASE_URL}/images/user/guest`);
      const data = await response.json();
      
      if (data.success) {
        return data.images;
      }
      return [];
    } catch (error) {
      console.error('Error fetching images:', error);
      return [];
    }
  }
};

// ==================== MIGRATION HELPER ====================

const MigrationHelper = {
  // Migrate localStorage products to backend
  async migrateProducts() {
    try {
      const localProducts = localStorage.getItem('gardiyProducts');
      if (!localProducts) {
        console.log('No products to migrate');
        return { success: true, count: 0 };
      }

      const products = JSON.parse(localProducts);
      console.log(`📦 Migrating ${products.length} products...`);

      const result = await ProductAPI.bulkImport(products);
      
      if (result.success) {
        console.log(`✅ Migrated ${products.length} products!`);
        // Keep localStorage as backup for now
        // localStorage.removeItem('gardiyProducts');
      }

      return result;
    } catch (error) {
      console.error('Error migrating products:', error);
      throw error;
    }
  },

  // Migrate localStorage design to backend
  async migrateDesign() {
    try {
      const localDesign = localStorage.getItem('gardiyDesign');
      if (!localDesign) {
        console.log('No design to migrate');
        return { success: true };
      }

      const design = JSON.parse(localDesign);
      console.log('📐 Migrating design...');

      const result = await DesignAPI.save(design);
      
      if (result.success) {
        console.log('✅ Design migrated!');
        // Keep localStorage as backup for now
        // localStorage.removeItem('gardiyDesign');
      }

      return result;
    } catch (error) {
      console.error('Error migrating design:', error);
      throw error;
    }
  },

  // Check backend connection
  async checkConnection() {
    try {
      const response = await fetch('http://localhost:5000/health');
      const data = await response.json();
      
      if (data.status === 'healthy' && data.database === 'connected') {
        console.log('✅ Backend connected!');
        return true;
      }
      
      console.warn('⚠️ Backend not ready:', data);
      return false;
    } catch (error) {
      console.error('❌ Cannot connect to backend:', error);
      return false;
    }
  }
};

// ==================== STORAGE ADAPTER ====================

// Drop-in replacement for GarDIYStorage that uses backend
window.GarDIYStorageBackend = {
  // Products
  async getProducts() {
    const isConnected = await MigrationHelper.checkConnection();
    if (!isConnected) {
      // Fallback to localStorage
      const local = localStorage.getItem('gardiyProducts');
      return local ? JSON.parse(local) : [];
    }
    return await ProductAPI.getAll();
  },

  async saveProducts(products) {
    const isConnected = await MigrationHelper.checkConnection();
    if (!isConnected) {
      localStorage.setItem('gardiyProducts', JSON.stringify(products));
      return;
    }
    
    // Save to backend
    for (const product of products) {
      await ProductAPI.create(product);
    }
  },

  async addProduct(product) {
    const isConnected = await MigrationHelper.checkConnection();
    if (!isConnected) {
      const products = this.getProducts();
      products.push(product);
      localStorage.setItem('gardiyProducts', JSON.stringify(products));
      return;
    }
    
    await ProductAPI.create(product);
  },

  // Design
  async saveDesign(design) {
    const isConnected = await MigrationHelper.checkConnection();
    if (!isConnected) {
      localStorage.setItem('gardiyDesign', JSON.stringify(design));
      return;
    }
    
    await DesignAPI.save(design);
  },

  async loadDesign() {
    const isConnected = await MigrationHelper.checkConnection();
    if (!isConnected) {
      const local = localStorage.getItem('gardiyDesign');
      return local ? JSON.parse(local) : null;
    }
    
    return await DesignAPI.loadLatest();
  },

  // Image
  setImage(imageData) {
    localStorage.setItem('gardiyLandscapeImage', imageData);
  },

  getImage() {
    return localStorage.getItem('gardiyLandscapeImage');
  },

  async uploadImage(imageData) {
    const isConnected = await MigrationHelper.checkConnection();
    if (!isConnected) {
      this.setImage(imageData);
      return imageData;
    }
    
    const result = await ImageAPI.uploadBase64(imageData, 'landscape');
    return ImageAPI.getImageUrl(result.filename);
  }
};

// Export for use in other files
window.ProductAPI = ProductAPI;
window.DesignAPI = DesignAPI;
window.ImageAPI = ImageAPI;
window.MigrationHelper = MigrationHelper;

console.log('📡 GarDIY API Handler loaded!');
