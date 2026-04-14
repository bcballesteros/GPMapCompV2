import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Point from 'ol/geom/Point.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import Select from 'ol/interaction/Select.js';
import Translate from 'ol/interaction/Translate.js';
import { defaults as defaultControls, Attribution, ScaleLine, Zoom } from 'ol/control.js';
import { click } from 'ol/events/condition.js';
import { isEmpty } from 'ol/extent.js';
import { fromLonLat } from 'ol/proj.js';
import { OSM, TileWMS, Vector as VectorSource, XYZ } from 'ol/source.js';
import { Circle, Fill, Stroke, Style, Text } from 'ol/style.js';

const ol = {
    Collection,
    Feature,
    Map,
    View,
    proj: {
        fromLonLat
    },
    extent: {
        isEmpty
    },
    control: {
        defaults: defaultControls,
        Attribution,
        ScaleLine,
        Zoom
    },
    source: {
        OSM,
        TileWMS,
        Vector: VectorSource,
        XYZ
    },
    layer: {
        Tile: TileLayer,
        Vector: VectorLayer
    },
    interaction: {
        Select,
        Translate
    },
    events: {
        condition: {
            click
        }
    },
    style: {
        Circle,
        Fill,
        Stroke,
        Style,
        Text
    },
    format: {
        GeoJSON
    },
    geom: {
        Point
    }
};

export default ol;
