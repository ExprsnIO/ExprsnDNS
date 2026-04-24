/**
 * Exprsn DNS - Zone Routes
 */

const express = require('express');
const { authenticate, requireScope } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const zoneSchemas = require('../validators/zone');
const zoneController = require('../controllers/zoneController');
const recordController = require('../controllers/recordController');

const router = express.Router();

router.use(authenticate());

router.get('/', requireScope('zones:read'), zoneController.list);
router.post('/', requireScope('zones:write'), validate(zoneSchemas.zoneCreate), zoneController.create);

router.get('/by-name/:name', requireScope('zones:read'), zoneController.getByName);

router.get('/:id', requireScope('zones:read'), zoneController.get);
router.patch('/:id', requireScope('zones:write'), validate(zoneSchemas.zoneUpdate), zoneController.update);
router.delete('/:id', requireScope('zones:write'), zoneController.remove);

router.get('/:zoneId/records', requireScope('zones:read'), recordController.list);
router.post('/:zoneId/records', requireScope('zones:write'), validate(zoneSchemas.recordCreate), recordController.create);
router.get('/:zoneId/records/:recordId', requireScope('zones:read'), recordController.get);
router.patch('/:zoneId/records/:recordId', requireScope('zones:write'), validate(zoneSchemas.recordUpdate), recordController.update);
router.delete('/:zoneId/records/:recordId', requireScope('zones:write'), recordController.remove);

module.exports = router;
