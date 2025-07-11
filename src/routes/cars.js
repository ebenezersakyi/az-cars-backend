const express = require('express');
const router = express.Router();
const carController = require('../controllers/carController');
const { protect } = require('../middleware/auth');
const { upload } = require('../utils/fileUpload');

// Configure car image upload middleware
const uploadCarImages = upload.fields([
  { name: 'images', maxCount: 40 } // Allow up to 10 images per upload
]);

// Public routes - anyone can view cars
router.get('/', carController.getCars);
router.get('/diagnostic', carController.getDiagnosticCars);
router.get('/search', carController.searchCars);
router.get('/reference/data', carController.getReferenceData);
router.get('/brand/model/:modelId', carController.getBrandByModel);
router.get('/models/brand/:brandId', carController.getModelsByBrand);
router.get('/makes', carController.getMakes);
router.get('/models', carController.getModels);
router.get('/:id', carController.getCar);

// Debugging route - validate car data without creating
router.post('/validate', carController.validateCarData);

// Make and Model creation routes (protected)
router.post('/makes', protect, carController.createMake);
router.post('/models', protect, carController.createModel);

// Make and Model deletion routes (protected)
router.delete('/makes/:id', protect, carController.deleteMake);
router.delete('/models/:id', protect, carController.deleteModel);

// Protected routes - only authenticated users can modify
router.post('/', protect, uploadCarImages, carController.createCar);
router.put('/:id', protect, uploadCarImages, carController.updateCar);
router.delete('/:id', protect, carController.deleteCar);

// Car image management routes
router.post('/:id/images', protect, uploadCarImages, carController.uploadCarImages);
router.delete('/:id/images/:imageUrl', protect, carController.deleteCarImage);

// Car approval routes
router.put('/:id/approve', protect, carController.approveCar);
router.put('/:id/reject', protect, carController.rejectCar);

// Car archive routes
router.put('/:id/archive', protect, carController.archiveCar);
router.put('/:id/unarchive', protect, carController.unarchiveCar);

module.exports = router; 

