function success(res, data = {}, message = "OK", status = 200) {
  return res.status(status).json({ success: true, message, ...data });
}

function fail(res, message = "Something went wrong", status = 500, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

module.exports = { success, fail };
