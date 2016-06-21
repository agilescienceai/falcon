import React, {Component, PropTypes} from 'react';
import styles from './Preview.css';

export default class PreviewController extends Component {
    constructor(props) {
        super(props);
        this.renderTable = this.renderTable.bind(this);
        this.testClass = this.testClass.bind(this);
    }

    testClass() {
        return 'test-tables-created';
    }

    renderTable(table) {
        const tableHeaders = table.get('columnnames').map(
            column => <th>{column}</th>
        );
        const renderCell = cell => <td>{cell}</td>;
        const tableRows = table.get('rows').map(
            row => <tr>{row.map(renderCell)}</tr>
        );
        return (
            <table>
                <thead>{tableHeaders}</thead>
                <tbody>{tableRows}</tbody>
            </table>
        );
    }

    render() {
        const tables = this.props.ipc.get('tables');

        if (!tables) {
            return null;
        }

        const renderedTables = tables.map(
            table => {
                const tableName = table.keySeq().first();

                return (
                    <div>
                        <div className={styles.tableHeader}>
                            Preview of table: <u>{tableName}</u>
                        </div>
                        {this.renderTable(table.get(tableName))}
                    </div>
                );
            }
        );

        return (
            <div id="test-tables">
                {renderedTables}
            </div>
        );
    }

}
