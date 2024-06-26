const fs = require('fs')
const Mustache = require('mustache')
const http = require('axios')
const aws4 = require('aws4')
const URL = require('url')
const { Logger } = require('@aws-lambda-powertools/logger')
const {
	injectLambdaContext,
} = require('@aws-lambda-powertools/logger/middleware')
const { Tracer } = require('@aws-lambda-powertools/tracer')
const {
	captureLambdaHandler,
} = require('@aws-lambda-powertools/tracer/middleware')
const tracer = new Tracer({ serviceName: process.env.serviceName })
const middy = require('@middy/core')

const logger = new Logger({ serviceName: process.env.serviceName })

const restaurantsApiRoot = process.env.RESTAURANTS_API
const ordersApiRoot = process.env.orders_api
const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID
const cognitoClientId = process.env.COGNITO_CLIENT_ID
const awsRegion = process.env.AWS_REGION

const days = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
]

const template = fs.readFileSync('static/index.html', 'utf-8')

const getRestaurants = async () => {
	logger.debug('getting restaurants...', { url: restaurantsApiRoot })
	const url = URL.parse(restaurantsApiRoot)
	const opts = {
		host: url.hostname,
		path: url.pathname,
	}
	aws4.sign(opts)

	const response = await http.get(restaurantsApiRoot, {
		headers: opts.headers,
	})

	const data = await response.data
	tracer.addResponseAsMetadata(data, 'GET /restaurants')

	return data
}

module.exports.handler = middy(async (event, context) => {
	logger.setLogLevel('INFO')
	logger.refreshSampleRateCalculation()

	const restaurants = await getRestaurants()
	logger.debug('got restaurants', { count: restaurants.length })
	const dayOfWeek = days[new Date().getDay()]

	const view = {
		awsRegion,
		cognitoUserPoolId,
		cognitoClientId,
		dayOfWeek,
		restaurants,
		searchUrl: `${restaurantsApiRoot}/search`,
		placeOrderUrl: ordersApiRoot,
	}
	const html = Mustache.render(template, view)
	const response = {
		statusCode: 200,
		headers: {
			'content-type': 'text/html; charset=UTF-8',
		},
		body: html,
	}

	return response
})
	.use(injectLambdaContext(logger))
	.use(captureLambdaHandler(tracer))
