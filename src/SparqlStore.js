/*eslint no-unused-vars: 0*/
/*eslint no-console: 0*/
/*eslint no-debugger: 0*/
/*eslint func-style: 0*/
/*eslint max-params: 0*/
/*eslint complexity: 0*/

import Promise from 'promise';
import RdfStore from 'rdfstore';
import {promises, jsonld} from 'jsonld';
import Immutable from 'immutable';

function allTriplesQuery() {
    return 'CONSTRUCT { ?s ?p ?o } ' +
        'WHERE { ?s ?p ?o .}';
}

function datasetQuery() {
    return 'CONSTRUCT { ?s ?p ?o } ' +
    'WHERE { ' +
        '?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://purl.org/linked-data/cube#DataSet>. ' +
        '?s ?p ?o . ' +
    '} ';
}

function dsdQuery(dataset) {
    return 'CONSTRUCT  {?dsd ?p ?o}' +
            'WHERE { ' +
                '<' + dataset + '> <http://purl.org/linked-data/cube#structure> ?dsd . ' +
                '?dsd ?p ?o . ' +
            '}';
}

function csQuery(dsd) {
    return 'SELECT ?o ' +
            'WHERE { ' +
                '<' + dsd + '> <http://purl.org/linked-data/cube#component> ?o ' +
            '}';
}

function dimElementsQuery(dim, dataset) {
    return 'CONSTRUCT {?s ?p ?o } ' +
        'WHERE { ' +
           '?ob <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://purl.org/linked-data/cube#Observation>. ' +
           '?ob <http://purl.org/linked-data/cube#dataSet> <' + dataset + '>. ' +
           '?ob <' + dim + '> ?s. ' +
           '?s ?p ?o . ' +
        '}';
}

function observationsQuery(dataset) {
    return 'CONSTRUCT { ?s ?p ?o } ' +
        'WHERE { ' +
           '?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://purl.org/linked-data/cube#Observation>. ' +
           '?s <http://purl.org/linked-data/cube#dataSet> <' + dataset + '>. ' +
           '?s ?p ?o . ' +
        '}';
}

function componentQuery(ds, dsd, component) {
    return 'CONSTRUCT {?comptype ?p ?o} ' +
        'WHERE { ' +
            '<' + ds + '> <http://purl.org/linked-data/cube#structure> <' + dsd + '>  . ' +
            '<' + dsd + '> <http://purl.org/linked-data/cube#component> ?s . ' +
            '?s <' + component + '> ?comptype . ' +
            '?comptype ?p ?o  .' +
        '}';
}

class SparqlStore {

    constructor(triple) {
        this.triple = triple;
        this.internalStore = null;
        this.result = {};
        this.result.defaultLanguage = 'en';
    }

    /**
     * parse - Parse graph object from rdfstore with jsonld.
     *
     * @param  {type} graph Graph object returned from rdfstrore by executing
     * a CONSTRUCT query.
     * @return {type} jsonld object array
     */
    parse(graph) {
        return promises.fromRDF(graph.toNT(), {format: 'application/nquads'});
    }

    execute(query) {
        return new Promise((fulfill, reject) => {
            this.internalStore.execute(
                query, (err, res) => {
                    if (err) reject(err);
                    else fulfill(res);
                });
        });
    }

    start() {
        return new Promise((fulfill, reject) => {
            RdfStore.create((err, store) => {
                if (err) reject(err);
                else fulfill(store);
            });
        }).then(store => { //better way to handle side effects with promise?
            this.internalStore = store;
            return Promise.resolve(this);
        });
    }

    load() {
        return new Promise((fulfill, reject) => {
            this.internalStore.load('text/n3', this.triple, (err, res) => {
                if (err) reject(err);
                else fulfill(res);
            });
        });
    }

    /**
     * import - Imports and validates all nessecary components
     * from a dataCube. (e.g. dataset, dsd ...)
     *
     * @return {Promise} Returns the promise of a json with all data.
     */
    import() {
        if (this.internalStore) {
            return this.getDatasets()
            .then(ds => {
                if (ds.length === 0) return Promise.reject('No datasets found.');
                this.result.dataset = ds[0];
                return this.getDsd(ds[0]);
            })
            .then(dsd => {
                if (dsd.length === 0) return Promise.reject('No dsd found.');
                this.result.dataStructureDefinition = dsd[0];
                const p =
                    [this.getDimensions(this.result.dataset, dsd[0]), this.getMeasure(this.result.dataset, dsd[0])];
                return Promise.all(p);
            })
            .then(res => {
                if (res[1].length === 0) return Promise.reject('No measures found.');
                if (res[0].length === 0) return Promise.reject('No dimensions found.');
                this.result.defaultMeasureProperty = res[1][0];
                this.result.dimensions = res[0];
                const p = res[0]
                    .map(dim => this.getDimElements(dim, this.result.dataset));
                return Promise.all(p);
            })
            .then(dimEls => {
                const temp = Immutable.fromJS(dimEls);
                if (temp.flatten(1).size === 0) return Promise.reject('No dimEls found.');
                this.result.dimensionElements = temp
                    .reduce((map, dimEl, idx) => {
                        const dimUri = Immutable.fromJS(this.result.dimensions)
                            .getIn([idx, '@id']);
                        return map.set(dimUri, dimEl);
                    }, Immutable.Map()).toJS();
                return this.getObservations(this.result.dataset);
            })
            .then(obs => {
                if (obs.length === 0) return Promise.reject('No observations found.');
                this.result.observations = obs;
                return Promise.resolve(this.result);
            })
            .catch(console.log);
        }

        return Promise.reject(new Error('Store is not initialized.'));
    }

    getDatasets() {
        return this.execute(datasetQuery()).then(this.parse);
    }

    getDsd(dataset) {
        return this.execute(dsdQuery(dataset['@id'])).then(this.parse);
    }

    getCs(dsd) {
        return this.execute(csQuery(dsd));
    }

    getDimensions(ds, dsd) {
        return this.execute(componentQuery(ds['@id'], dsd['@id'], 'http://purl.org/linked-data/cube#dimension'))
            .then(this.parse);
    }

    getMeasure(ds, dsd) {
        return this.execute(componentQuery(ds['@id'], dsd['@id'], 'http://purl.org/linked-data/cube#measure'))
            .then(this.parse);
    }

    getDimElements(dim, dataset) {
        return this.execute(dimElementsQuery(dim['@id'], dataset['@id'])).then(this.parse);
    }

    getObservations(dataset) {
        return this.execute(observationsQuery(dataset['@id'])).then(this.parse);
    }
    getAllTriples() {
        return this.execute(allTriplesQuery()).then(this.parse);
    }
}

export default SparqlStore;