const express = require('express');
const calendarController = require('../controllers/calendarController');
const { authenticate } = require('../middleware/auth');
const { ForbiddenError } = require('../utils/errors');

const router = express.Router();
router.use(authenticate);

const requirePermission = (action) => {
  return (req, _res, next) => {
    if (req.user?.permissions?.all === true) return next();
    const perm = req.user?.permissions?.calendar || {};
    const allowed = Boolean(perm[action]) || Boolean(perm.view);
    if (!allowed) return next(new ForbiddenError('You do not have permission to use the calendar'));
    next();
  };
};

router.get('/sources', requirePermission('view'), calendarController.getSourceDefinitions);
router.get('/upcoming', requirePermission('view'), calendarController.getUpcomingEvents);
router.get('/preferences', requirePermission('view'), calendarController.getPreferences);
router.put('/preferences', requirePermission('view'), calendarController.updatePreferences);
router.get('/:id', requirePermission('view'), calendarController.getEvent);
router.post('/:id/reminders', requirePermission('view'), calendarController.createReminder);
router.put('/:id', requirePermission('edit'), calendarController.updateEvent);
router.delete('/:id', requirePermission('delete'), calendarController.deleteEvent);
router.post('/', requirePermission('create'), calendarController.createEvent);
router.get('/', requirePermission('view'), calendarController.listEvents);

module.exports = router;
