import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import KML from 'ol/format/KML.js';
import WMSCapabilities from 'ol/format/WMSCapabilities.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import Select from 'ol/interaction/Select.js';
import Translate from 'ol/interaction/Translate.js';
import Draw from 'ol/interaction/Draw.js';
import Overlay from 'ol/Overlay.js';
import { getArea, getLength } from 'ol/sphere.js';
import { unByKey } from 'ol/Observable.js';
import { defaults as defaultControls, Attribution, ScaleLine, Zoom } from 'ol/control.js';
import { click } from 'ol/events/condition.js';
import { isEmpty } from 'ol/extent.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import { OSM, TileWMS, Vector as VectorSource, XYZ } from 'ol/source.js';
import { Circle, Fill, Icon, Stroke, Style, Text } from 'ol/style.js';

const ol = {
    Collection,
    Feature,
    Map,
    View,
    proj: {
        fromLonLat,
        toLonLat,
        transformExtent
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
        Translate,
        Draw
    },
    Overlay,
    Observable: {
        unByKey
    },
    sphere: {
        getArea,
        getLength
    },
    events: {
        condition: {
            click
        }
    },
    style: {
        Circle,
        Fill,
        Icon,
        Stroke,
        Style,
        Text
    },
    format: {
        GeoJSON,
        KML,
        WMSCapabilities
    },
    geom: {
        Point,
        LineString,
        Polygon
    }
};

export default ol;
