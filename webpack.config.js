const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    context: __dirname,
    entry: './src/main.ts',
    output: {
        filename: "bundle.js",
        path: path.resolve(__dirname, 'dist'),
        publicPath: "dist/"
    },
    mode: "development",

    module: {
        rules: [
            {
                test: /\.worker\.(js|ts)$/, // Match .worker.js and .worker.ts files
                use: [
                    {
                        loader: 'ts-loader', // Use ts-loader to process TypeScript files
                        options: {
                            transpileOnly: true, // Speeds up compilation
                        },
                    },
                ],
            },
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: 'ts-loader',
            },
            {
                test: /\.wgsl$/,
                use: 'ts-shader-loader'
            },
        ]
    },

    plugins: [
        new HtmlWebpackPlugin({
            template: './index.html', // Path to your index.html file
            filename: 'index.html',   // Output file name
        }),
    ],

    resolve: {
        extensions: ['.ts', '.js']
    }
}