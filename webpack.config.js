const path = require('path');

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
                test: /\.ts$/,
                exclude: /node_modules/,
                use: 'ts-loader',
            },
            {
                test: /\.wgsl$/,
                use: 'ts-shader-loader'
            }
        ]
    },

    resolve: {
        extensions: ['.ts', '.js']
    }
}