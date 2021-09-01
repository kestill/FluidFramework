/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Node, Project } from "ts-morph";
import * as fs from "fs";
import { getPackageDetails, PackageDetails } from "./packageJson";

export interface PackageAndTypeData{
    packageDetails: PackageDetails;
    typeData: TypeData[];
}

export interface TypeData{
    readonly name: string;
    readonly deprecated: boolean;
    readonly internal: boolean;
}

function hasDocTag(node: Node, tagName: "deprecated" | "internal"){
    if(Node.isJSDocableNode(node)) {
        for(const doc of node.getJsDocs()){
            for(const tag of doc.getTags()){
                if(tag.getTagName() === tagName){
                    return true;
                }
            }
        }
    }
    return false;
}

function getNodeTypeData(node:Node, namespacePrefix?:string): TypeData[]{

    /*
        handles namespaces e.g.
        export namespace foo{
            export type first: "first";
            export type second: "second";
        }
        this will prefix foo and generate two type data:
        foo.first and foo.second
    */
    if (Node.isNamespaceDeclaration(node)){
        const typeData: TypeData[]=[];
        for(const s of node.getStatements()){
            typeData.push(...getNodeTypeData(s, node.getName()));
        }
        return typeData;
    }

    /*
        handles variable statements: const foo:number=0, bar:number = 0;
        this just grabs the declarations: foo:number=0 and bar:number
        which we can make type data from
    */
    if(Node.isVariableStatement(node)){
        const typeData: TypeData[]=[];
        for(const dec of node.getDeclarations()){
            typeData.push(...getNodeTypeData(dec, namespacePrefix));
        }
        return typeData
    }

    if(Node.isClassDeclaration(node)
        || Node.isEnumDeclaration(node)
        || Node.isInterfaceDeclaration(node)
        || Node.isFunctionDeclaration(node)
        || Node.isTypeAliasDeclaration(node)
        || Node.isVariableDeclaration(node)){

        const name = namespacePrefix !== undefined
            ? `${namespacePrefix}.${node.getName()}`
            : node.getName()!;

        const deprecated = hasDocTag(node, "deprecated");
        const internal = hasDocTag(node, "internal");

        return [{
            name,
            deprecated,
            internal,
        }];
    }


    throw new Error(`Unknown Export Kind: ${node.getKindName()}`)
}


export function generateTypeDataForProject(packageDir: string, dependencyName: string | undefined): PackageAndTypeData {

    const basePath = dependencyName === undefined
        ? packageDir
        : `${packageDir}/node_modules/${dependencyName}`;

    const tsConfigPath =`${basePath}/tsconfig.json`

    if(!fs.existsSync(tsConfigPath)){
        throw new Error(`Tsconfig json does not exist: ${tsConfigPath}`)
    }

    const packageDetails = getPackageDetails(basePath);

    const project = new Project({
        skipFileDependencyResolution: true,
        tsConfigFilePath: tsConfigPath,
    });

    const file = project.getSourceFile("index.ts")
    if(file == undefined){
        throw new Error("index.ts does not exist in package source");
    }
    const typeData: TypeData[]=[];

    const exportedDeclarations = file.getExportedDeclarations();
    for(const declarations of exportedDeclarations.values()){
        for(const dec of declarations){
            typeData.push(...getNodeTypeData(dec));
        }
    }
    return {
        packageDetails,
        typeData,
    };
}