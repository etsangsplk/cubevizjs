/*eslint func-style: [2, "declaration"]*/
/*eslint complexity: [2, 4]*/
/*eslint no-debugger:0*/
/*eslint no-unused-vars: 0*/
/*eslint no-console: 0*/
/*eslint max-statements: 0*/

import Immutable, {List, Map} from 'immutable';

import HeatmapRule from './rules/HeatmapRule.js';
import PieChartRule from './rules/PieChartRule.js';
import DataCube from './DataCube.js';

const comparison = {
    name: 'comparison',
    eval(dataCube) {
        const rules = List([new PieChartRule(), new HeatmapRule()]);
        const charts = rules.map(rule => {

            //TODO implement singleElementDimensions and multiElementDimensions method

            return Map({
                complex: 'comparison',
                name: rule.getName(),
                score: rule.getScore(dataCube),
                isSatisfied: rule.isSatisfiedBy(dataCube),
                singleElementDimensions: rule.getSingleElementDimensions(dataCube),
                multiElementDimensions: rule.getMultiElementDimensions(dataCube)
            });
        });

        return charts;
    }
};

// Contexts

const testContext = {
    name: 'Test Context',
    description: 'Test context. Contains multiple complexes.',
    complexes: [comparison]
};

const Contexts = Immutable.fromJS([testContext]);

function containsDimEl(dimEl, dimEls) {
    return dimEls.find(dEl => dEl.get('@id') === dimEl.get('@id')) !== undefined;
}

// Discards every observation point not in dimensions
function selectObservations(dimensionsElements, measure, attribute, attrEl, dataCube) {
    return dataCube.observations
        .filter(o => dimensionsElements.every((dimEls, dimUri) => {
            return dimEls.some(dimEl => {
                const dim = dataCube.getDimensionFromUri(dimUri);
                const dimensionEls = dataCube.getDimensionElementsFromObservation(o, List([dim]));
                return containsDimEl(dimEl, dimensionEls);
            });
        }))
        .filter(o => {
            const measureEls = dataCube.getMeasureElementsFromObservation(o, List([measure]));
            return measureEls.size > 0;
        })
        .filter(o => {
            if (!attribute)
                return true;

            const attributeEls = dataCube.getAttributeElementsFromObservation(o, List([attribute]));
            if (attributeEls.size === 0)
                return false;

            return attributeEls.find(aEl => aEl.get('@id') === attrEl.get('@id'));
        });
}

//Returns list with dimensions and according dimension elements
function selectDimensions(dimEls, dataCube) {

    return dimEls.reduce((list, dimEl) => {
        const dim = dataCube.getDimension(dimEl);

        if (list.find(d => d.get('@id') === dim.get('@id')))
            return list;

        return list.push(dim);
    }, Immutable.List());
}

export function createDataCube(selections, dataCube) {

    const defaultMeasure = dataCube.measures.first();
    const defaultAttribute = (dataCube.attributes.size > 0) ? dataCube.attributes.first() : null;
    const defaultAttrEl = (dataCube.attributes.size > 0)
        ? dataCube.attributesElements.get(defaultAttribute.get('@id')).first()
        : null;

    const dimensions = selectDimensions(selections, dataCube);
    const dimensionsMap = dataCube.assignDimEls(selections, dimensions);
    const observations = selectObservations(dimensionsMap, defaultMeasure, defaultAttribute, defaultAttrEl, dataCube);

    const dc = dataCube.createDataCube(selections, dimensions, observations);
    return dc;
}


/**
 * determineCharts - Determines possible charts to use
 * in a specific context. A context is a set of multiple rules predefined by CubeViz or
 * defined by the user
 *
 * @param  {type} context description
 * @param  {type} dc      description
 * @return {type}         description
 */
export function determineCharts(context, dc) {
    const ctx = (context) ? context : Contexts.first();

    if (!dc)
        return List([]);
    const charts = ctx.get('complexes')
        .map(complex => complex.get('eval')(dc))
        .reduce((res, chartlist) => {
            //TODO implement replacement with higher scored rules
            return res.push(chartlist)
                .flatten(1)
                .sortBy(chrt => chrt.get('score'))
                .reverse();
        }, List());
    return charts;
}