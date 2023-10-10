'use strict';

const {Application} = require('./app');

if (require.main === module) {
    const app = new Application()
    app.start()
        .catch((err) => {
            console.error(err);
        });
}