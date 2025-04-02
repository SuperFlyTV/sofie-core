module.exports = async () => {
	process.env.TZ = 'UTC'
	process.env.MONGO_URL = 'mongodb://127.0.0.1:123/meteor-test'
}
